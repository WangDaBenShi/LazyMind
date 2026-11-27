import type { ReactNode } from "react";
import { useRequest } from "ahooks";
import { Button, Tag } from "antd";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import {
  channelAccountLabel, channelAccountStatusKey, channelStatusLabelKey,
  isChannelAccountAvailable, listChannelAccounts,
} from "@/modules/channelGateway/api";
import { channelGateEnabled, channels, getPreferences, providers } from "@/modules/notifications/api";
import { getAnkiStatus } from "@/modules/vocabulary/api";
import { listCloudConnections } from "@/modules/vocabulary/cloudApi";
import { ankiConnectionStatus, cloudConnectionStatus } from "@/modules/vocabulary/connectionStatus";
import { SettingsOverviewRow } from "./SettingsOverviewCard";
import { settingsRouteParams } from "./settingsRouteContext";

function SummaryRows<T>({ title, load, children }: {
  title: string;
  load: () => Promise<T>;
  children: (data: T) => ReactNode;
}) {
  const { t } = useTranslation();
  const { data, error, loading, refresh } = useRequest(load, {
    // Report failures in the row without logging the underlying request.
    onError: () => {},
  });
  if (!loading && !error && data !== undefined) return <>{children(data)}</>;
  return <SettingsOverviewRow title={title}
    description={<span role="status">{t(loading ? "notifications.loading" : "settingsPage.diagnostics.readFailed")}</span>}
    control={!loading && <Button className="settings-dashboard-quick-action" size="small" onClick={refresh}>
      {t("settingsPage.retry")}
    </Button>}
  />;
}

export type OverviewModuleSection = "external_apps" | "channels" | "notifications" | "recovery";

export function SettingsOverviewModuleRows({ section }: { section: OverviewModuleSection }) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const open = (options: Record<string, string>) =>
    setParams(settingsRouteParams(params, { section, ...options }));
  const status = (text: string) => <Tag className="settings-status-tag">{text}</Tag>;
  const action = (title: string, text: string, onClick: () => void) =>
    <Button className="settings-dashboard-quick-action" size="small" onClick={onClick}
      aria-label={`${t("settingsPage.goToDetailAria", { title })} · ${text}`}>{text}</Button>;
  const cloudProviders = ["eudic", "maimemo"] as const;

  if (section === "external_apps") return <>
    <SummaryRows title={cloudProviders.map(provider => t(`vocabularyCloud.${provider}`)).join(" · ")} load={listCloudConnections}>
      {connections => cloudProviders.map(provider => {
        const connection = connections.find(item => item.provider === provider);
        return <SettingsOverviewRow key={provider} title={t(`vocabularyCloud.${provider}`)}
          description={connection?.target_name || t("vocabularyCloud.providerDescription")}
          control={status(t(`vocabularyCloud.${cloudConnectionStatus(connection)}`))} />;
      })}
    </SummaryRows>
    <SummaryRows title="Anki" load={getAnkiStatus}>
      {anki => <SettingsOverviewRow title="Anki"
        description={t(anki.available ? "ankiSettings.appDescription" : "ankiSettings.deploymentUnavailable")}
        control={status(t(`vocabularyCloud.${ankiConnectionStatus(anki)}`))} />}
    </SummaryRows>
  </>;
  if (section === "channels") return <>
    {providers.map(provider => {
      const platform = t(`notifications.${provider}`);
      return <SummaryRows key={provider} title={platform} load={() => listChannelAccounts(provider, { silentError: true })}>
        {({ items }) => {
          const accounts = items.map(account => {
            const name = channelAccountLabel(account, items);
            const state = t(`notifications.${channelStatusLabelKey(channelAccountStatusKey(account))}`);
            return `${name} · ${state}`;
          }).join(" / ");
          const available = t("notifications.availableCount", { count: items.filter(isChannelAccountAvailable).length });
          return <SettingsOverviewRow title={platform}
            description={accounts ? <span title={accounts}>{accounts}</span> : t("notifications.noAccounts")}
            control={action(platform, available, () => open({ provider }))} />;
        }}
      </SummaryRows>;
    })}
  </>;
  if (section === "notifications") return (
    <SummaryRows title={t("notifications.global")} load={() => getPreferences({ silentError: true })}>
      {prefs => {
        const selected = channels.filter(channel => prefs.defaults.channels[channel]?.enabled);
        const active = selected.filter(channel => channelGateEnabled(prefs, channel));
        return <>
          <SettingsOverviewRow title={t("notifications.global")} description={t("notifications.globalHint")}
            control={status(t(prefs.enabled ? "notifications.on" : "notifications.off"))} />
          <SettingsOverviewRow title={t("notifications.channels")}
            description={[
              t("notifications.configuredChannelCount", { count: selected.length }),
              ...selected.map(channel => t(`notifications.${channel}`)),
            ].join(" · ")}
            control={status(t("notifications.channelCount", { enabled: active.length, count: channels.length }))} />
        </>;
      }}
    </SummaryRows>
  );
  return <>
    {(["trash", "archive"] as const).map(view => {
      const title = t(`settingsPage.recovery.${view}`);
      return <SettingsOverviewRow key={view} title={title} description={t(`settingsPage.recovery.${view}Subtitle`)}
        control={action(title, t("settingsPage.view"), () => open({ view }))} />;
    })}
  </>;
}
