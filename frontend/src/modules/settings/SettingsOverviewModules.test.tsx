import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigProvider } from "antd";
import { MemoryRouter, useNavigate, useSearchParams } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { SettingsOverviewModuleRows, type OverviewModuleSection } from "./SettingsOverviewModules";

const mocks = vi.hoisted(() => ({
  getAnkiStatus: vi.fn(),
  listCloudConnections: vi.fn(),
  listChannelAccounts: vi.fn(),
  getPreferences: vi.fn(),
}));
vi.mock("@/modules/vocabulary/api", () => ({ getAnkiStatus: mocks.getAnkiStatus }));
vi.mock("@/modules/vocabulary/cloudApi", () => ({ listCloudConnections: mocks.listCloudConnections }));
vi.mock("@/modules/channelGateway/api", async original => ({
  ...await original<typeof import("@/modules/channelGateway/api")>(),
  listChannelAccounts: mocks.listChannelAccounts,
}));
vi.mock("@/modules/notifications/api", async original => ({
  ...await original<typeof import("@/modules/notifications/api")>(),
  getPreferences: mocks.getPreferences,
}));

function RoutedOverview({ sections }: { sections: OverviewModuleSection[] }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  if (params.get("section") === "overview") return <>{sections.map(section => (
    <section key={section} aria-label={section}><SettingsOverviewModuleRows section={section} /></section>
  ))}</>;
  return <>
    <output aria-label="destination">{params.toString()}</output>
    <button onClick={() => navigate(-1)}>Back</button>
  </>;
}

function renderOverview(sections: OverviewModuleSection[] = ["external_apps", "channels", "notifications", "recovery"]) {
  render(<ConfigProvider button={{ autoInsertSpace: false }} theme={{ token: { motion: false } }}>
    <MemoryRouter initialEntries={["/settings?section=overview&return_to=%2Fagent%2Fchat%2Fexample"]}>
      <RoutedOverview sections={sections} />
    </MemoryRouter>
  </ConfigProvider>);
}

function rows(section: string) {
  return within(screen.getByRole("region", { name: section }));
}

describe("Settings overview module summaries", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    await i18n.changeLanguage("zh-CN");
    mocks.getAnkiStatus.mockResolvedValue({ available: true, connected: true, enabled: false });
    mocks.listCloudConnections.mockResolvedValue([
      { provider: "eudic", configured: true, enabled: true, target_id: "book", target_name: "Study" },
    ]);
    mocks.listChannelAccounts.mockImplementation(async (provider: string) => ({ items: provider === "wechat" ? [{
      id: "personal", provider, label: "Reading group", status: "connected", runtime_status: "running",
      capabilities: { notification_ready: false },
    }] : [] }));
    mocks.getPreferences.mockResolvedValue({
      enabled: false,
      defaults: { channels: { desktop: { enabled: true }, feishu: { enabled: true } } },
    });
  });

  it.each(["zh-CN", "en-US"])("shows real application, account and notification states in %s", async language => {
    await i18n.changeLanguage(language);
    renderOverview();
    const t = i18n.t.bind(i18n);
    const apps = rows("external_apps");
    expect(await apps.findByText(t("vocabularyCloud.connectedPaused"))).toBeVisible();
    expect(apps.getByText(t("vocabularyCloud.connectedEnabled"))).toBeVisible();
    expect(apps.getByText(t("vocabularyCloud.incomplete"))).toBeVisible();
    expect(apps.getByText("Study")).toBeVisible();

    const connections = rows("channels");
    expect(await connections.findByText(`Reading group · ${t("notifications.pendingActivation")}`)).toBeVisible();
    const openWechat = t("settingsPage.goToDetailAria", { title: t("notifications.wechat") });
    expect(connections.getByRole("button", { name: new RegExp(openWechat) }))
      .toHaveTextContent(t("notifications.availableCount", { count: 0 }));
    const notifications = rows("notifications");
    expect(await notifications.findByText(t("notifications.off"))).toBeVisible();
    expect(notifications.getByText([
      t("notifications.configuredChannelCount", { count: 2 }), t("notifications.desktop"), t("notifications.feishu"),
    ].join(" · "))).toBeVisible();
    expect(notifications.getByText(t("notifications.channelCount", { enabled: 0, count: 4 }))).toBeVisible();
  });

  it("retries an unreadable data source independently and distinguishes unsupported Anki from a failed read", async () => {
    mocks.getAnkiStatus.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ available: false });
    renderOverview();
    const apps = rows("external_apps");
    expect(await apps.findByText(i18n.t("settingsPage.diagnostics.readFailed"))).toBeVisible();
    expect(apps.getByText("Study")).toBeVisible();
    expect(apps.queryByText(i18n.t("ankiSettings.deploymentUnavailable"))).toBeNull();
    fireEvent.click(apps.getByRole("button", { name: i18n.t("settingsPage.retry") }));
    expect(await apps.findByText(i18n.t("ankiSettings.deploymentUnavailable"))).toBeVisible();
    expect(mocks.getAnkiStatus).toHaveBeenCalledTimes(2);
    expect(mocks.listCloudConnections).toHaveBeenCalledTimes(1);
    expect(mocks.listChannelAccounts).toHaveBeenCalledTimes(3);
    expect(mocks.getPreferences).toHaveBeenCalledTimes(1);
  });

  it("requests only the mounted module’s data", async () => {
    renderOverview(["notifications"]);
    await screen.findByText(i18n.t("notifications.off"));
    expect(mocks.listChannelAccounts).not.toHaveBeenCalled();
    expect(mocks.getAnkiStatus).not.toHaveBeenCalled();
    expect(mocks.listCloudConnections).not.toHaveBeenCalled();
  });

  it.each([
    ["channels", "notifications.wechat", "provider=wechat"],
    ["recovery", "settingsPage.recovery.trash", "view=trash"],
    ["recovery", "settingsPage.recovery.archive", "view=archive"],
  ])("opens %s from its overview action and preserves the chat return route (%s)", async (section, actionKey, extra) => {
    renderOverview();
    const title = i18n.t(actionKey);
    const label = i18n.t("settingsPage.goToDetailAria", { title });
    const button = await rows(section).findByRole("button", { name: new RegExp(label) });
    fireEvent.click(button);
    const destination = new URLSearchParams(screen.getByLabelText("destination").textContent!);
    expect(destination.get("section")).toBe(section);
    expect(destination.get("return_to")).toBe("/agent/chat/example");
    new URLSearchParams(extra).forEach((value, key) => expect(destination.get(key)).toBe(value));
  });

  it("reads the saved preferences when returning from a detail page", async () => {
    renderOverview();
    expect(await rows("notifications").findByText(i18n.t("notifications.off"))).toBeVisible();
    const openWechat = i18n.t("settingsPage.goToDetailAria", { title: i18n.t("notifications.wechat") });
    fireEvent.click(await rows("channels").findByRole("button", { name: new RegExp(openWechat) }));
    mocks.getPreferences.mockResolvedValue({ enabled: true, defaults: { channels: { desktop: { enabled: true } } } });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(rows("notifications").getByText(i18n.t("notifications.channelCount", { enabled: 1, count: 4 }))).toBeVisible());
    expect(rows("notifications").getByText(i18n.t("notifications.on"))).toBeVisible();
  });
});
