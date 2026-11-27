import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingsOverviewSection } from "./api";
import { OverviewEnvironmentRow, OverviewKnowledgeRows, OverviewModelServiceRows } from "./OverviewServiceRows";

const { loadTools, loadInventory, loadGroups, loadVariables } = vi.hoisted(() => ({
  loadTools: vi.fn(), loadInventory: vi.fn(), loadGroups: vi.fn(), loadVariables: vi.fn(),
}));
vi.mock("./userEnvApi", () => ({ listUserEnvironmentVariables: loadVariables }));
vi.mock("@/modules/modelProvider/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/modules/modelProvider/api")>(),
  modelProvidersApi: {
    apiCoreModelProvidersWithGroupsGet: loadInventory,
    apiCoreModelProvidersModelProviderIdGroupsGet: loadGroups,
  },
}));
vi.mock("@/modules/memory/toolApi", () => ({ listToolAssetsPage: loadTools }));
vi.mock("react-i18next", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-i18next")>(),
  useTranslation: () => ({
    i18n: { language: "en-US" },
    t: (key: string, values?: Record<string, unknown>) => {
      if (key.endsWith("enabledCount")) return `${values?.enabled}/${values?.registered}`;
      if (key.endsWith("configuredItems")) return `Configured: ${values?.count}`;
      if (key.endsWith("openConfigAria")) return `Open ${values?.name}`;
      return key;
    },
  }),
}));

const models: SettingsOverviewSection = {
  id: "models", title: "Models", route: "/settings?section=models", status: "ready", detail: "",
  counts: { total: 0, enabled: 0, runnable: 0, verified: 0, configured: 10, model_providers: 4 },
};

describe("overview service rows", () => {
  beforeEach(() => {
    loadInventory.mockReset();
    loadGroups.mockReset();
  });
  it("shows only user variable counts and distinguishes an unavailable list from an empty list", async () => {
    loadVariables.mockResolvedValueOnce([
      { name: "FIRST_VAR", masked_value: "masked secret", enabled: true }, { name: "SECOND_VAR", enabled: false },
    ]);
    const { unmount } = render(<OverviewEnvironmentRow />);
    expect(screen.getByRole("status")).toHaveTextContent("common.loading");
    expect(await screen.findByText("1/2")).toBeVisible();
    expect(loadVariables).toHaveBeenCalledWith({ silentError: true });
    expect(screen.queryByText(/FIRST_VAR|SECOND_VAR|masked secret/)).toBeNull();
    unmount();

    loadVariables.mockRejectedValueOnce(new Error("unavailable"));
    render(<OverviewEnvironmentRow />);
    expect(await screen.findByText("settingsPage.diagnostics.readFailed")).toBeVisible();
    expect(screen.queryByText("0/0")).toBeNull();
  });
  it("shows up to three actual supplier names and opens the selected supplier", () => {
    const onConfigure = vi.fn();
    render(<OverviewModelServiceRows section={{ ...models, model_supplier_preview: ["A", "B", "C", "D"].map((name) => (
      { id: `supplier-${name}`, name, is_custom: true }
    )) }} onConfigure={onConfigure} onConfigureService={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.queryByText("D")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open B" }));
    expect(onConfigure).toHaveBeenCalledWith("supplier-B");
    expect(loadInventory).not.toHaveBeenCalled();
  });

  it("fills a count-only overview with real brands and configured services from one batch", async () => {
    const onConfigure = vi.fn();
    const onConfigureService = vi.fn();
    loadInventory.mockResolvedValue({ data: { data: { providers: [
      { id: "inactive", name: "Unused", category: "model", is_configured: false },
      { id: "acme", name: "Acme", category: "model", is_configured: true, is_custom: true },
      { id: "ocr", name: "PaddleOCR", category: "ocr", is_configured: true },
      { id: "pending", name: "Pending search", category: "search", is_configured: false },
      { id: "paper", name: "OpenAlex", category: "datasource", is_configured: true },
      { id: "translate", name: "DeepL", category: "translation", is_configured: true },
    ] } } });
    render(<OverviewModelServiceRows section={{ ...models, counts: { ...models.counts, model_providers: 1, external_services: 3 } }}
      onConfigure={onConfigure} onConfigureService={onConfigureService} />);
    fireEvent.click(await screen.findByRole("button", { name: "Open Acme" }));
    fireEvent.click(screen.getByRole("button", { name: "Open PaddleOCR" }));
    fireEvent.click(screen.getByRole("button", { name: "Open OpenAlex" }));
    expect(onConfigure).toHaveBeenCalledWith("acme");
    expect(onConfigureService.mock.calls).toEqual([["parsing", "ocr"], ["academic", "paper"]]);
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(loadInventory).toHaveBeenCalledTimes(1);
    expect(loadGroups).not.toHaveBeenCalled();
  });

  it("uses saved model metadata for an unverified brand and counts its duplicate services once", async () => {
    loadInventory.mockResolvedValue({ data: { providers: [
      { id: "empty", name: "Empty model", category: "model" },
      { id: "plan", name: "QwenCodingPlan", brand_key: "Qwen", service_key: "plan", category: "model", is_configured: true },
      { id: "std", name: "Qwen", brand_key: "Qwen", service_key: "standard", category: "model", is_configured: true },
      { id: "custom", name: "Local", category: "model", is_custom: true },
    ] } });
    loadGroups.mockImplementation(({ modelProviderId }) => Promise.resolve({ data: { groups: [
      { model_count: modelProviderId === "custom" ? 1 : 0, is_verified: false, has_api_key: false },
    ] } }));
    render(<OverviewModelServiceRows section={{ ...models, counts: { ...models.counts, model_providers: 2 } }}
      onConfigure={vi.fn()} onConfigureService={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Open Local" })).toBeVisible();
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(loadGroups.mock.calls.map(([request]) => request.modelProviderId)).toEqual(["empty", "custom"]);
  });

  it("shows supplied names immediately and fills remaining rows from the service inventory", async () => {
    loadInventory.mockResolvedValue({ data: { providers: [
      { id: "trans", name: "Bing Translate Web", category: "translation", is_configured: true },
    ] } });
    render(<OverviewModelServiceRows section={{ ...models,
      counts: { ...models.counts, model_providers: 1, external_services: 1 },
      model_supplier_preview: [{ id: "core", name: "Core supplier", is_custom: true }],
    }} onConfigure={vi.fn()} onConfigureService={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Open Core supplier" })).toBeVisible();
    expect(await screen.findByRole("button", { name: "Open Bing Translate Web" })).toBeVisible();
    expect(loadGroups).not.toHaveBeenCalled();
  });

  it("distinguishes an unavailable inventory from an empty account and keeps the details action", async () => {
    loadInventory.mockRejectedValue(new Error("read failed"));
    const onConfigure = vi.fn();
    const { rerender } = render(<OverviewModelServiceRows section={models} onConfigure={onConfigure} onConfigureService={vi.fn()} />);
    expect(await screen.findByText("settingsPage.overview.supplierListUnavailable")).toBeVisible();
    rerender(<OverviewModelServiceRows section={{ ...models, counts: { ...models.counts, model_providers: 0, external_services: 0 } }}
      onConfigure={onConfigure} onConfigureService={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("settingsPage.overview.noProviders")).toBeVisible());
    fireEvent.click(screen.getByRole("button"));
    expect(onConfigure).toHaveBeenCalledWith();
    expect(loadInventory).toHaveBeenCalledTimes(1);
  });

  it("summarizes the detail page's registered tools and directory setting and opens that group", async () => {
    loadTools.mockResolvedValueOnce({ records: [
      { id: "kb", isEnabled: true }, { id: "data_sources", isEnabled: true },
      { id: "local_fs", isEnabled: false }, { id: "cloud_files", isEnabled: false },
    ] });
    const onConfigure = vi.fn();
    render(<OverviewKnowledgeRows documentDirectoriesEnabled={false} onConfigure={onConfigure} />);
    expect(await screen.findByText("1/2")).toBeVisible();
    expect(screen.getByText("1/1")).toBeVisible();
    expect(screen.getByText("0/2")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open settingsPage.knowledge.groups.fileAccess.title" }));
    expect(onConfigure).toHaveBeenCalledWith("file-access");
  });

  it("does not present a failed read as disabled tools", async () => {
    loadTools.mockRejectedValueOnce(new Error("unavailable"));
    render(<OverviewKnowledgeRows documentDirectoriesEnabled onConfigure={vi.fn()} />);
    expect(await screen.findAllByText("settingsPage.diagnostics.readFailed")).toHaveLength(3);
    expect(screen.queryByText("0/0")).toBeNull();
  });
});
