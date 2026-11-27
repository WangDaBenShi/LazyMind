import { Button } from "antd";
import { useRequest } from "ahooks";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { StructuredAsset } from "@/modules/memory/shared";
import { listToolAssetsPage } from "@/modules/memory/toolApi";
import { getProviderBrandDisplayName } from "@/modules/modelProvider/providerDisplayNames";
import { translationProviderDisplayName } from "@/modules/modelProvider/translationProviderNames";
import { loadOverviewModelServices, previewSize, type OverviewServiceCategory } from "./overviewModelServices";
import type { SettingsOverviewSection } from "./api";
import { knowledgeGroupCounts, overviewKnowledgeGroups } from "./knowledgeGroups";
import { SettingsOverviewRow } from "./SettingsOverviewCard";
import { listUserEnvironmentVariables } from "./userEnvApi";

export function OverviewEnvironmentRow() {
  const { t } = useTranslation();
  const { data, error } = useRequest(async () => {
    const items = await listUserEnvironmentVariables({ silentError: true });
    return { enabled: items.filter(item => item.enabled).length, registered: items.length };
  }, { onError: () => {} });
  const summary = data ? t("settingsPage.knowledge.enabledCount", data)
    : t(error ? "settingsPage.diagnostics.readFailed" : "common.loading");
  return <SettingsOverviewRow title={t("settingsPage.envVars.scope.user")} description={<span role="status">{summary}</span>} />;
}

export function OverviewModelServiceRows({ section, onConfigure, onConfigureService }: {
  section?: SettingsOverviewSection;
  onConfigure: (providerId?: string) => void;
  onConfigureService: (category: OverviewServiceCategory, id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language;
  const preview = section?.model_supplier_preview;
  const count = section?.counts.model_providers;
  const needsInventory = count != null && (
    (!preview && count > 0) ||
    ((preview?.length ?? 0) < previewSize && (section?.counts.external_services ?? 0) > 0)
  );
  const [inventory, setInventory] = useState<Awaited<ReturnType<typeof loadOverviewModelServices>>>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setInventory(undefined);
    setFailed(false);
    if (!needsInventory) return;
    const controller = new AbortController();
    void loadOverviewModelServices(preview, count, controller.signal).then(result => {
      if (!controller.signal.aborted) setInventory(result);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [preview, count, needsInventory, section?.counts.external_services]);

  const configure = (title: string, action: () => void) => <Button
    className="settings-dashboard-quick-action" size="small"
    aria-label={t("settingsPage.knowledge.openConfigAria", { name: title })} onClick={action}
  >{t("settingsPage.knowledge.configure")}</Button>;
  const suppliers = (preview ?? inventory?.suppliers ?? []).slice(0, previewSize);
  if (suppliers.length || inventory?.services.length) return <>
    {suppliers.map(supplier => {
      const title = getProviderBrandDisplayName(supplier, language);
      return <SettingsOverviewRow key={supplier.id} title={title} description={t("settingsPage.models.providers")}
        control={configure(title, () => onConfigure(supplier.id))} />;
    })}
    {inventory?.services.map(service => {
      const title = service.category === "translation" ? translationProviderDisplayName(service.name, language) : service.name;
      return <SettingsOverviewRow key={service.id} title={title} description={t(`modelProvider.defaults.services.${service.category}`)}
        control={configure(title, () => onConfigureService(service.category, service.id))} />;
    })}
  </>;

  const loading = needsInventory && !inventory && !failed;
  if (loading) return <SettingsOverviewRow title={t("common.loading")} />;
  const empty = count === 0 && !section?.counts.external_services;
  return <SettingsOverviewRow title={t(empty ? "settingsPage.overview.noProviders" : "settingsPage.overview.supplierListUnavailable")}
    control={<Button className="settings-dashboard-quick-action" size="small" onClick={() => onConfigure()}>{t("settingsPage.knowledge.configure")}</Button>} />;
}

export function OverviewKnowledgeRows({ documentDirectoriesEnabled, onConfigure }: {
  documentDirectoriesEnabled?: boolean;
  onConfigure: (group: string) => void;
}) {
  const { t } = useTranslation();
  const [tools, setTools] = useState<Map<string, StructuredAsset>>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void listToolAssetsPage({ silentError: true }).then(({ records }) => {
      if (active) setTools(new Map(records.map((tool) => [tool.id, tool])));
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  return <>{overviewKnowledgeGroups(t).map((group) => {
    let summary = t("common.loading");
    if (failed || (tools && group.id === "retrieval" && documentDirectoriesEnabled == null)) {
      summary = t("settingsPage.diagnostics.readFailed");
    } else if (tools) {
      summary = t("settingsPage.knowledge.enabledCount", knowledgeGroupCounts(group, tools, Boolean(documentDirectoriesEnabled)));
    }
    return <SettingsOverviewRow key={group.id} title={group.title} description={summary} control={
      <Button className="settings-dashboard-quick-action" size="small" aria-label={t("settingsPage.knowledge.openConfigAria", { name: group.title })}
        onClick={() => onConfigure(group.id)}>{t("settingsPage.knowledge.configure")}</Button>
    } />;
  })}</>;
}
