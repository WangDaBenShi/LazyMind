import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigProvider, message } from "antd";
import { createInstance } from "i18next";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import zhCN from "@/i18n/locales/zh-CN";
import enUS from "@/i18n/locales/en-US";
import SettingsPage from "./index";

const mocks = vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, String(value)),
    },
  });
  return {
    mode: "local",
    role: "admin",
    cloudAvailable: false,
    vocabularyEnabled: false,
    fetchSettingsOverview: vi.fn(),
    fetchConfiguredProviders: vi.fn(),
    listUserEnvironmentVariables: vi.fn(),
    fetchUserUiPreferences: vi.fn(),
    applySettingsChange: vi.fn(),
    runSettingsChecks: vi.fn(),
    getPersonalization: vi.fn(),
    putPersonalization: vi.fn(),
    disableTool: vi.fn(),
  };
});

vi.mock("@/components/auth", () => ({
  AgentAppsAuth: { getUserInfo: () => ({ role: mocks.role }) },
}));
vi.mock("@/runtime/features", () => ({
  runtimeFeatures: { hideEvo: true, get hideUserGroupSurfaces() { return mocks.mode !== "cloud"; } },
}));
vi.mock("@/runtime/mode", () => ({
  isDesktopRuntime: () => mocks.mode === "desktop",
  isLocalRuntime: () => mocks.mode === "local",
  isVocabularyEnabled: () => mocks.vocabularyEnabled,
}));
vi.mock("@/runtime/cloud/session", () => ({
  getCloudSession: vi.fn().mockResolvedValue(null),
  isCloudBusinessAvailable: () => mocks.cloudAvailable,
  LAZYMIND_CLOUD_SESSION_CHANGED_EVENT: "test-cloud-session-changed",
}));
vi.mock("./api", () => ({
  fetchSettingsOverview: mocks.fetchSettingsOverview,
  applySettingsChange: mocks.applySettingsChange,
  runSettingsChecks: mocks.runSettingsChecks,
}));
vi.mock("@/modules/user/uiPreferencesApi", () => ({
  fetchUserUiPreferences: mocks.fetchUserUiPreferences,
  patchUserUiPreferences: vi.fn(),
}));
vi.mock("@/modules/modelProvider/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/modelProvider/api")>();
  return { ...actual, modelProvidersApi: { ...actual.modelProvidersApi, apiCoreModelProvidersWithGroupsGet: mocks.fetchConfiguredProviders } };
});
vi.mock("./QuickModelSettings", () => ({ default: () => <div>Model configuration</div> }));
vi.mock("@/api/generated/core-client", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/api/generated/core-client")>(),
  PersonalizationApiFactory: () => ({ apiCorePersonalizationSettingGet: mocks.getPersonalization, apiCorePersonalizationSettingPut: mocks.putPersonalization }),
}));
vi.mock("@/modules/memory/toolApi", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/modules/memory/toolApi")>(),
  listToolAssets: async () => ["vocab_learn", "memory"].map(id => ({ id, isEnabled: true, isAvailable: true })),
  listToolAssetsPage: async () => ({ records: [{ id: "kb", isEnabled: true }] }),
  disableTool: mocks.disableTool,
}));
vi.mock("@/modules/channelGateway/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/modules/channelGateway/api")>(),
  listChannelAccounts: async () => ({ items: [] }),
}));
vi.mock("@/modules/notifications/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/modules/notifications/api")>(),
  getPreferences: async () => ({ enabled: false, defaults: { channels: {} } }),
}));
vi.mock("@/modules/vocabulary/api", () => ({ getAnkiStatus: async () => ({ available: false }) }));
vi.mock("@/modules/vocabulary/cloudApi", () => ({ listCloudConnections: async () => [] }));
vi.mock("./userEnvApi", () => ({ listUserEnvironmentVariables: mocks.listUserEnvironmentVariables }));
vi.mock("@/modules/admin/pages/group", () => ({ default: () => null }));
vi.mock("@/modules/admin/pages/user", () => ({ default: () => null }));
vi.mock("./KnowledgeDataSettings", () => ({ default: () => <h1>Knowledge configuration</h1> }));
vi.mock("@/modules/modelProvider/pages/ExternalServicesPage", () => ({
  default: ({ visibleCategories, parsingControl }: { visibleCategories: string[]; parsingControl?: ReactNode }) => <>
    <output aria-label="Service categories">{visibleCategories.join(",")}</output>
    {parsingControl}
  </>,
}));

function CurrentRoute() {
  const location = useLocation();
  return <output aria-label="Current route">{location.pathname}{location.search}</output>;
}

async function renderOverview(language = "zh-CN") {
  const i18n = createInstance();
  await i18n.init({
    lng: language,
    fallbackLng: "zh-CN",
    resources: { "zh-CN": { translation: zhCN }, "en-US": { translation: enUS } },
    interpolation: { escapeValue: false },
  });
  render(
    <I18nextProvider i18n={i18n}>
      <ConfigProvider button={{ autoInsertSpace: false }} theme={{ token: { motion: false } }}>
        <MemoryRouter initialEntries={["/settings?section=overview&return_to=%2Fagent%2Fchat%2Fhome%2Ftest-conversation"]}>
          <SettingsPage />
          <CurrentRoute />
        </MemoryRouter>
      </ConfigProvider>
    </I18nextProvider>,
  );
  await screen.findByRole("heading", { level: 1, name: i18n.t("settingsPage.overview.title") });
  return i18n.t.bind(i18n);
}

function card(title: string) {
  return within(screen.getByRole("heading", { level: 3, name: title }).closest("section")!);
}

function routeParams() {
  return new URLSearchParams(screen.getByLabelText("Current route").textContent!.split("?")[1]);
}

describe("Settings overview", () => {
  beforeEach(() => {
    mocks.mode = "local";
    mocks.role = "admin";
    mocks.cloudAvailable = false;
    mocks.vocabularyEnabled = false;
    mocks.getPersonalization.mockReset().mockResolvedValue({ data: { enabled: true } });
    mocks.putPersonalization.mockReset().mockImplementation(async ({ personalizationSettingOpenAPIRequest }) => ({ data: personalizationSettingOpenAPIRequest }));
    mocks.disableTool.mockReset().mockResolvedValue(undefined);
    mocks.fetchConfiguredProviders.mockReset().mockResolvedValue({ data: { providers: [] } });
    mocks.listUserEnvironmentVariables.mockReset().mockResolvedValue([]);
    mocks.fetchSettingsOverview.mockReset().mockResolvedValue({
      controls: { document_parsing_enabled: true },
      sections: [],
      issues: [],
      updated_at: "2026-10-19T00:00:00Z",
    });
    mocks.fetchUserUiPreferences.mockReset().mockResolvedValue({
      developer_mode_active: false,
      performance_stats_enabled: false,
      sensitive_word_filter_enabled: false,
    });
    mocks.applySettingsChange.mockReset().mockResolvedValue({ key: "document_parsing_enabled", enabled: false });
  });

  afterEach(async () => { await act(async () => { message.destroy(); }); });

  it.each(["zh-CN", "en-US"])("opens configured external services directly from an older overview in %s", async (language) => {
    mocks.fetchSettingsOverview.mockResolvedValue({
      controls: {}, issues: [], sections: [{ id: "models", counts: { configured: 3, model_providers: 1, external_services: 2 } }],
    });
    mocks.fetchConfiguredProviders.mockResolvedValue({ data: { providers: [
      { id: "personal-model", name: "My LLM", is_custom: true, category: "model", is_configured: true },
      { id: "tavily", name: "Tavily", category: "search", is_configured: true },
      { id: "mineru", name: "MinerU", category: "ocr", is_configured: true },
    ] } });
    const t = await renderOverview(language);
    const models = card(t("settingsPage.sections.models"));
    expect(await models.findByText("My LLM")).toBeVisible();
    expect(models.getByText("MinerU")).toBeVisible();
    expect(models.getByText(t("settingsPage.counts.providerBreakdown", { models: 1, services: 2 }))).toBeVisible();
    fireEvent.click(models.getByRole("button", { name: t("settingsPage.knowledge.openConfigAria", { name: "Tavily" }) }));
    await screen.findByLabelText("Service categories");
    expect(routeParams().get("section")).toBe("model_defaults");
    expect(routeParams().get("service")).toBe("search");
    expect(routeParams().get("item")).toBe("tavily");
    expect(routeParams().get("editor")).toBe("service");
    expect(routeParams().get("return_to")).toBe("/agent/chat/home/test-conversation");
  });

  it("retains the provider and external service totals alongside the three supplier previews", async () => {
    mocks.fetchSettingsOverview.mockResolvedValue({
      controls: {}, issues: [], sections: [{
        id: "models", counts: { model_providers: 4, external_services: 2 },
        model_supplier_preview: ["Alpha", "Beta", "Gamma", "Delta"].map(name => ({ id: name, name, is_custom: true })),
      }],
    });
    const t = await renderOverview();
    const models = card(t("settingsPage.sections.models"));
    expect(models.getByText("模型供应商 4 项 · 外部服务 2 项", { exact: false })).toBeVisible();
    for (const name of ["Alpha", "Beta", "Gamma"]) {
      expect(models.getByRole("button", { name: t("settingsPage.knowledge.openConfigAria", { name }) })).toBeEnabled();
    }
    expect(models.queryByText("Delta")).not.toBeInTheDocument();
  });

  it("uses consistent quick actions and opens diagnostics with the check results", async () => {
    mocks.runSettingsChecks.mockResolvedValue({ results: [], finished_at: "2026-11-03T00:00:00Z" });
    const t = await renderOverview();
    const models = card(t("settingsPage.sections.models"));
    expect(models.getByText(t("settingsPage.overview.supplierListUnavailable"))).toBeVisible();
    expect(models.getByRole("button", { name: t("settingsPage.knowledge.configure") })).toHaveClass("settings-dashboard-quick-action");
    const diagnostics = card(t("settingsPage.sections.diagnostics"));
    const check = diagnostics.getByRole("button", { name: t("settingsPage.check") });
    expect(check).toHaveClass("settings-dashboard-quick-action");
    expect(diagnostics.getByText(t("settingsPage.overview.recentResultsEmpty"))).toBeVisible();
    expect(diagnostics.getByRole("button", { name: t("settingsPage.viewResults") })).toHaveClass("settings-dashboard-quick-action");
    fireEvent.click(check);
    await waitFor(() => expect(routeParams().get("section")).toBe("diagnostics"));
    expect(mocks.runSettingsChecks).toHaveBeenCalledTimes(1);
    expect(routeParams().get("return_to")).toBe("/agent/chat/home/test-conversation");
  });

  it("shows the short desktop application version in the sidebar footer", async () => {
    mocks.mode = "desktop";
    vi.stubEnv("VITE_APP_VERSION", "0.4");
    vi.stubGlobal("lazymindDesktop", { appVersion: async () => "0.5.1-alpha.0" });
    try {
      await renderOverview();
      const version = await screen.findByLabelText("应用版本 0.5");
      expect(version).toHaveTextContent(/^v0.5$/);
      expect(version.closest(".settings-reference-sidebar-foot")).not.toBeNull();
      expect(screen.queryByText(/alpha/)).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it("shows the configured web version in the sidebar footer across settings pages", async () => {
    vi.stubEnv("VITE_APP_VERSION", "v0.5");
    vi.stubGlobal("lazymindDesktop", undefined);
    try {
      const t = await renderOverview();
      expect(await screen.findByLabelText("应用版本 0.5")).toHaveTextContent(/^v0.5$/);
      fireEvent.click(card(t("settingsPage.sections.memory")).getByRole("button", {
        name: t("settingsPage.goToDetailAria", { title: t("settingsPage.sections.memory") }),
      }));
      await screen.findByRole("heading", { level: 1, name: t("settingsPage.memory.title") });
      expect(screen.getByLabelText("应用版本 0.5")).toBeVisible();
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it.each([
    ["local", "admin", "zh-CN"],
    ["desktop", "user", "en-US"],
    ["cloud", "user", "zh-CN"],
    ["cloud", "admin", "en-US"],
  ])("mirrors the sidebar groups and retains model and memory controls for %s/%s", async (mode, role, language) => {
    mocks.mode = mode;
    mocks.role = role;
    mocks.cloudAvailable = mode === "desktop";
    mocks.vocabularyEnabled = mode === "desktop";
    const t = await renderOverview(language);
    if (mocks.cloudAvailable) await screen.findByRole("heading", { level: 3, name: t("settingsPage.sections.cloudUsage") });
    const navigation = screen.getByRole("navigation", { name: t("settingsPage.navAria") });
    const navGroups = Array.from(navigation.querySelectorAll<HTMLElement>(".settings-reference-nav-group"));
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map(heading => heading.textContent)).toEqual(navGroups.map(group => group.querySelector("p")?.textContent));
    headings.forEach((heading, index) => {
      const cards = within(heading.closest("section")!).getAllByRole("heading", { level: 3 });
      const buttons = within(navGroups[index]).getAllByRole("button").filter(button => !button.hasAttribute("aria-current"));
      expect(cards).toHaveLength(buttons.length);
      cards.forEach((item, position) => expect(within(buttons[position]).getByText(item.textContent!)).toBeVisible());
    });
    const hasCard = (name: string) => !!screen.queryByRole("heading", { level: 3, name });
    expect(hasCard(t("settingsPage.sections.organization"))).toBe(mode === "cloud" && role === "admin");
    expect(hasCard(t("settingsPage.sections.cloudUsage"))).toBe(mode === "desktop");
    expect(hasCard(t("ankiSettings.externalApps"))).toBe(mocks.vocabularyEnabled);
    const memory = card(t("settingsPage.sections.memory"));
    for (const capability of ["vocabulary", "read", "edit"]) {
      const title = t(`settingsPage.memory.${capability}.title`);
      expect(await memory.findByText(title)).toBeInTheDocument();
      expect(memory.getByText(t(`settingsPage.memory.${capability}.description`))).toBeInTheDocument();
      const toggle = memory.getByRole("switch", { name: t("settingsPage.memory.switchAria", { title }) });
      expect(toggle).toBeEnabled();
      expect(toggle).toBeChecked();
      expect(toggle).toHaveClass("ant-switch", "settings-ref-switch");
      expect(toggle).toHaveAccessibleDescription(t("common.enabled"));
    }
    expect(memory.getAllByRole("switch")).toHaveLength(3);
    const defaultModels = card(t("settingsPage.sections.defaultModels"));
    expect(defaultModels.getByText(t("settingsPage.controls.documentParsing.title"))).toBeInTheDocument();
    expect(defaultModels.getByRole("button", { name: t("settingsPage.quickConfig") })).toBeEnabled();
    expect(defaultModels.queryByRole("switch")).not.toBeInTheDocument();
    const knowledge = card(t("settingsPage.sections.knowledge"));
    for (const group of ["retrieval", "data", "fileAccess"]) {
      const title = t(`settingsPage.knowledge.groups.${group}.title`);
      expect(knowledge.getByText(title)).toBeVisible();
      const configure = knowledge.getByRole("button", { name: t("settingsPage.knowledge.openConfigAria", { name: title }) });
      expect(configure).toBeEnabled();
      expect(configure).toHaveClass("settings-dashboard-quick-action");
    }
  });

  it("opens environment variables from the overview and preserves the return route", async () => {
    mocks.listUserEnvironmentVariables.mockResolvedValueOnce([
      { name: "TEST_SERVICE_TOKEN", enabled: true }, { name: "TEST_SERVICE_URL", enabled: false },
    ]);
    const t = await renderOverview();
    const title = t("settingsPage.sections.envVars");
    const environment = card(title);
    expect(await environment.findByText(t("settingsPage.knowledge.enabledCount", { enabled: 1, registered: 2 }))).toBeVisible();
    expect(environment.queryByText(/TEST_SERVICE_/)).not.toBeInTheDocument();
    fireEvent.click(environment.getByRole("button", { name: t("settingsPage.goToDetailAria", { title }) }));
    await screen.findByRole("heading", { level: 1, name: title });
    expect(routeParams().get("section")).toBe("env_vars");
    expect(routeParams().get("return_to")).toBe("/agent/chat/home/test-conversation");
  });

  it.each([["users", "userManagement"], ["groups", "groupManagement"]])(
    "opens the %s organization tab from the overview", async (view, labelKey) => {
      mocks.mode = "cloud";
      const t = await renderOverview();
      const organization = card(t("settingsPage.sections.organization"));
      const title = t(`admin.${labelKey}`);
      fireEvent.click(organization.getByRole("button", { name: t("settingsPage.goToDetailAria", { title }) }));
      expect(await screen.findByRole("tab", { name: title, selected: true })).toBeVisible();
      expect(routeParams().get("section")).toBe("organization");
      expect(routeParams().get("view")).toBe(view);
      expect(routeParams().get("return_to")).toBe("/agent/chat/home/test-conversation");
    },
  );

  it.each(["vocabulary", "read", "edit"])("toggles %s in the overview and retains the same state on the detail page", async (capability) => {
    const t = await renderOverview();
    const memoryTitle = t("settingsPage.sections.memory");
    const switchName = t("settingsPage.memory.switchAria", { title: t(`settingsPage.memory.${capability}.title`) });
    const toggle = await card(memoryTitle).findByRole("switch", { name: switchName });
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveAccessibleDescription(t("common.disabled"));
    expect(routeParams().get("section")).toBe("overview");
    if (capability === "read") {
      expect(mocks.putPersonalization.mock.calls).toEqual([[{ personalizationSettingOpenAPIRequest: { enabled: false } }]]);
      expect(mocks.disableTool).not.toHaveBeenCalled();
    } else {
      expect(mocks.disableTool.mock.calls).toEqual([[capability === "vocabulary" ? "vocab_learn" : "memory"]]);
      expect(mocks.putPersonalization).not.toHaveBeenCalled();
    }
    fireEvent.click(card(memoryTitle).getByRole("button", { name: t("settingsPage.goToDetailAria", { title: memoryTitle }) }));
    await screen.findByRole("heading", { level: 1, name: t("settingsPage.memory.title") });
    expect(screen.getByRole("switch", { name: switchName })).not.toBeChecked();
    expect(routeParams().get("section")).toBe("memory");
    expect(routeParams().get("return_to")).toBe("/agent/chat/home/test-conversation");
    expect(mocks.applySettingsChange).not.toHaveBeenCalled();
  });

  it("opens document parsing directly, preserving the return route and the switch value", async () => {
    const t = await renderOverview();
    fireEvent.click(card(t("settingsPage.sections.defaultModels")).getByRole("button", {
      name: t("settingsPage.quickConfig"),
    }));
    await screen.findByLabelText("Service categories");
    expect(screen.getByLabelText("Service categories")).toHaveTextContent("parsing");
    expect(screen.getByRole("switch", { name: t("settingsPage.knowledge.documentParsingAria") })).toBeChecked();
    expect(routeParams().get("section")).toBe("model_defaults");
    expect(routeParams().get("service")).toBe("parsing");
    expect(routeParams().get("return_to")).toBe("/agent/chat/home/test-conversation");
    expect(mocks.applySettingsChange).not.toHaveBeenCalled();
  });

  it.each([["retrieval", "retrieval"], ["data", "data"], ["fileAccess", "file-access"]])(
    "opens the %s group on the knowledge settings page", async (labelKey, group) => {
      const t = await renderOverview();
      const title = t(`settingsPage.knowledge.groups.${labelKey}.title`);
      fireEvent.click(card(t("settingsPage.sections.knowledge")).getByRole("button", {
        name: t("settingsPage.knowledge.openConfigAria", { name: title }),
      }));
      await screen.findByRole("heading", { name: "Knowledge configuration" });
      expect(routeParams().get("section")).toBe("knowledge");
      expect(routeParams().get("group")).toBe(group);
      expect(routeParams().has("tool")).toBe(false);
      expect(routeParams().get("return_to")).toBe("/agent/chat/home/test-conversation");
      expect(mocks.applySettingsChange).not.toHaveBeenCalled();
    },
  );

  it("retains confirmation and persistence when disabling document parsing", async () => {
    const t = await renderOverview();
    fireEvent.click(card(t("settingsPage.sections.defaultModels")).getByRole("button", { name: t("settingsPage.quickConfig") }));
    const toggle = await screen.findByRole("switch", { name: t("settingsPage.knowledge.documentParsingAria") });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(mocks.applySettingsChange).not.toHaveBeenCalled();
    mocks.fetchSettingsOverview.mockResolvedValue({ controls: { document_parsing_enabled: false }, sections: [], issues: [] });
    const confirmation = (await screen.findAllByRole("dialog")).find((dialog) =>
      within(dialog).queryByRole("button", { name: t("settingsPage.confirmDisable") }),
    );
    expect(confirmation).toBeDefined();
    fireEvent.click(within(confirmation!).getByRole("button", { name: t("settingsPage.confirmDisable") }));
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
    expect(mocks.applySettingsChange).toHaveBeenCalledTimes(1);
    expect(mocks.applySettingsChange).toHaveBeenCalledWith({ key: "document_parsing_enabled", enabled: false });
    expect(routeParams().get("section")).toBe("model_defaults");
  });

  it("retains the current parsing value after a failed save and allows retry", async () => {
    mocks.applySettingsChange.mockRejectedValueOnce(new Error("Test save failure"));
    const t = await renderOverview();
    fireEvent.click(card(t("settingsPage.sections.defaultModels")).getByRole("button", { name: t("settingsPage.quickConfig") }));
    const toggle = await screen.findByRole("switch", { name: t("settingsPage.knowledge.documentParsingAria") });
    fireEvent.click(toggle);
    const confirmation = (await screen.findAllByRole("dialog")).find((dialog) =>
      within(dialog).queryByRole("button", { name: t("settingsPage.confirmDisable") }),
    );
    expect(confirmation).toBeDefined();
    fireEvent.click(within(confirmation!).getByRole("button", { name: t("settingsPage.confirmDisable") }));
    const failureMessage = await screen.findByText(t("settingsPage.change.saveFailed"));
    const dialog = failureMessage.closest<HTMLElement>('[role="dialog"]')!;
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(within(dialog).getByRole("button", { name: t("settingsPage.retry") })).toBeEnabled();
    mocks.fetchSettingsOverview.mockResolvedValue({ controls: { document_parsing_enabled: false }, sections: [], issues: [] });
    fireEvent.click(within(dialog).getByRole("button", { name: t("settingsPage.retry") }));
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
    expect(mocks.applySettingsChange).toHaveBeenCalledTimes(2);
    expect(routeParams().get("section")).toBe("model_defaults");
  });
});
