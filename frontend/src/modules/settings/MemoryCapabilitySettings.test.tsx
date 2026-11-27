import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { message } from "antd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MemoryCapabilitySettings, { MemoryCapabilityOverview } from "./MemoryCapabilitySettings";
import { useMemoryCapabilities } from "./useMemoryCapabilities";

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), list: vi.fn(), enable: vi.fn(), disable: vi.fn(), notify: vi.fn() }));
vi.mock("@/api/generated/core-client", () => ({
  Configuration: class {},
  PersonalizationApiFactory: () => ({ apiCorePersonalizationSettingGet: mocks.get, apiCorePersonalizationSettingPut: mocks.put }),
}));
vi.mock("@/modules/memory/toolApi", () => ({
  listToolAssets: mocks.list, enableTool: mocks.enable, disableTool: mocks.disable, notifyToolAvailabilityChanged: mocks.notify,
}));
vi.mock("@/components/request", () => ({ BASE_URL: "", axiosInstance: {}, getLocalizedErrorMessage: () => "Save failed" }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, args?: { title?: string }) => args?.title || key }) }));

const titles = { read: "settingsPage.memory.read.title", edit: "settingsPage.memory.edit.title", vocabulary: "settingsPage.memory.vocabulary.title" };
const switchFor = (id: keyof typeof titles) => screen.getByRole("switch", { name: titles[id] });
const findReadSwitch = () => screen.findByRole("switch", { name: titles.read });
const toolAssets = [
  { id: "vocab_learn", isEnabled: false, isAvailable: true, readonly: false },
  { id: "memory", isEnabled: true, isAvailable: true, readonly: false },
];

function View({ detail = false }: { detail?: boolean }) {
  const memory = useMemoryCapabilities(true);
  return detail ? <MemoryCapabilitySettings memory={memory} /> : <MemoryCapabilityOverview memory={memory} />;
}

describe("personal memory capability settings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.get.mockResolvedValue({ data: { data: { enabled: true } } });
    mocks.list.mockResolvedValue(toolAssets);
    mocks.put.mockImplementation(async ({ personalizationSettingOpenAPIRequest }) => ({ data: personalizationSettingOpenAPIRequest }));
    mocks.disable.mockResolvedValue(undefined);
    mocks.enable.mockResolvedValue(undefined);
    vi.spyOn(message, "success").mockImplementation(() => undefined as never);
    vi.spyOn(message, "error").mockImplementation(() => undefined as never);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("suspends an enabled editor and restores it from the detail page using only the injection setting", async () => {
    const view = render(<View />);
    fireEvent.click(await findReadSwitch());
    await waitFor(() => expect(switchFor("read")).toBeEnabled());
    expect(switchFor("edit")).toBeDisabled();
    expect(switchFor("edit")).toHaveAccessibleDescription("settingsPage.memory.suspendedWithRead");
    expect(switchFor("edit")).toBeChecked();
    expect(switchFor("vocabulary")).toBeEnabled();
    view.rerender(<View detail />);
    expect(switchFor("edit")).toBeChecked();
    expect(switchFor("edit")).toBeDisabled();
    fireEvent.click(switchFor("read"));
    await waitFor(() => expect(switchFor("edit")).toBeEnabled());
    view.rerender(<View />);
    expect(switchFor("edit")).toBeChecked();
    expect(mocks.put.mock.calls).toEqual([
      [{ personalizationSettingOpenAPIRequest: { enabled: false } }],
      [{ personalizationSettingOpenAPIRequest: { enabled: true } }],
    ]);
    expect(mocks.disable).not.toHaveBeenCalled();
    expect(mocks.enable).not.toHaveBeenCalled();
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });

  it("changes vocabulary and editing independently through the corresponding tool endpoints", async () => {
    render(<View />);
    await findReadSwitch();
    switchFor("vocabulary").focus();
    fireEvent.keyDown(switchFor("vocabulary"), { key: "ArrowRight", keyCode: 39 });
    await waitFor(() => expect(switchFor("vocabulary")).toBeEnabled());
    fireEvent.click(switchFor("edit"));
    await waitFor(() => expect(switchFor("edit")).toBeEnabled());
    expect(mocks.enable.mock.calls).toEqual([["vocab_learn"]]);
    expect(mocks.disable.mock.calls).toEqual([["memory"]]);
    expect(mocks.put).not.toHaveBeenCalled();
    expect(switchFor("read")).toBeChecked();
    expect(switchFor("vocabulary")).toBeChecked();
    expect(switchFor("edit")).not.toBeChecked();
    expect(mocks.notify).toHaveBeenCalledWith({ id: "memory", enabled: false });
  });

  it("keeps an explicitly disabled editor off when injection resumes", async () => {
    mocks.get.mockResolvedValue({ data: { enabled: false } });
    mocks.list.mockResolvedValue([toolAssets[0], { ...toolAssets[1], isEnabled: false }]);
    render(<View />);
    await findReadSwitch();
    expect(switchFor("edit")).toHaveAccessibleDescription("common.disabled");
    fireEvent.click(switchFor("vocabulary"));
    await waitFor(() => expect(switchFor("read")).toBeEnabled());
    fireEvent.click(switchFor("read"));
    await waitFor(() => expect(switchFor("edit")).toBeEnabled());
    expect(switchFor("edit")).not.toBeChecked();
    expect(switchFor("vocabulary")).toBeChecked();
    expect(mocks.enable.mock.calls).toEqual([["vocab_learn"]]);
    expect(mocks.disable).not.toHaveBeenCalled();
  });

  it("preserves pending saves across navigation and rolls back injection and its dependent status on failure", async () => {
    let fail!: (error: Error) => void;
    mocks.put.mockReturnValue(new Promise((_resolve, reject) => { fail = reject; }));
    const view = render(<View />);
    fireEvent.click(await findReadSwitch());
    fireEvent.click(switchFor("read"));
    expect(mocks.put).toHaveBeenCalledTimes(1);
    view.rerender(<View detail />);
    expect(switchFor("read")).toBeDisabled();
    expect(switchFor("edit")).toBeDisabled();
    await act(async () => { fail(new Error("unavailable")); });
    expect(switchFor("read")).toBeChecked();
    expect(switchFor("edit")).toBeEnabled();
    view.rerender(<View />);
    expect(switchFor("edit")).toBeChecked();
    expect(screen.getByRole("alert")).toHaveTextContent("settingsPage.memory.saveFailed");
    expect(switchFor("read")).toBeEnabled();
  });

  it("rolls back a failed tool change and lets the user retry without modifying other capabilities", async () => {
    mocks.disable.mockRejectedValueOnce(new Error("temporary failure"));
    render(<View />);
    await findReadSwitch();
    fireEvent.click(switchFor("edit"));
    await screen.findByRole("alert");
    expect(switchFor("edit")).toBeChecked();
    expect(switchFor("edit")).toBeEnabled();
    expect(mocks.notify).not.toHaveBeenCalled();
    fireEvent.click(switchFor("edit"));
    await waitFor(() => expect(switchFor("edit")).toBeEnabled());
    expect(switchFor("edit")).not.toBeChecked();
    expect(switchFor("read")).toBeChecked();
    expect(mocks.disable.mock.calls).toEqual([["memory"], ["memory"]]);
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.enable).not.toHaveBeenCalled();
  });

  it("keeps unavailable and read-only tools inert and preserves the setting denied by the server", async () => {
    mocks.list.mockResolvedValue([
      { ...toolAssets[0], isEnabled: true, isAvailable: false }, { ...toolAssets[1], readonly: true },
    ]);
    mocks.put.mockRejectedValue({ isAxiosError: true, response: { status: 403 } });
    render(<View />);
    await findReadSwitch();
    expect(switchFor("vocabulary")).toBeDisabled();
    expect(switchFor("vocabulary")).toHaveAccessibleDescription("settingsPage.memory.unavailable");
    expect(switchFor("edit")).toBeDisabled();
    fireEvent.click(switchFor("vocabulary"));
    fireEvent.click(switchFor("edit"));
    fireEvent.click(switchFor("read"));
    await screen.findByRole("alert");
    expect(switchFor("read")).toBeChecked();
    expect(switchFor("read")).toBeDisabled();
    expect(mocks.disable).not.toHaveBeenCalled();
    expect(mocks.enable).not.toHaveBeenCalled();
  });

  it("allows independent vocabulary changes when injection cannot load and recovers on retry", async () => {
    mocks.get.mockRejectedValueOnce(new Error("offline"));
    render(<View />);
    await findReadSwitch();
    expect(switchFor("read")).toBeDisabled();
    expect(switchFor("edit")).toBeDisabled();
    expect(switchFor("vocabulary")).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "settingsPage.retry" }));
    await waitFor(() => expect(switchFor("read")).toBeEnabled());
    expect(switchFor("edit")).toBeChecked();
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });
});
