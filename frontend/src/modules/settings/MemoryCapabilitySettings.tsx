import type { Ref } from "react";
import { Alert, Button, Skeleton, Switch, Tag } from "antd";
import { ReloadOutlined, ToolOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { SettingsOverviewRow } from "./SettingsOverviewCard";
import type { MemoryCapabilities } from "./useMemoryCapabilities";

interface MemoryCapabilitySettingsProps {
  memory: MemoryCapabilities;
  headingRef?: Ref<HTMLHeadingElement>;
}

function MemoryLoadFeedback({ memory }: MemoryCapabilitySettingsProps) {
  const { t } = useTranslation();
  if (memory.loading) return <div className="settings-memory-loading"><Skeleton active paragraph={{ rows: 3 }} /></div>;
  if (memory.loadError) return <Alert
    type="error"
    showIcon
    message={t("settingsPage.memory.loadFailed")}
    description={t("settingsPage.memory.loadFailedDesc")}
    action={<Button size="small" icon={<ReloadOutlined aria-hidden="true" />} disabled={memory.saving !== null} onClick={memory.retry}>{t("settingsPage.retry")}</Button>}
  />;
  return null;
}

function SaveError() {
  const { t } = useTranslation();
  return <small className="settings-memory-capability-error" role="alert">{t("settingsPage.memory.saveFailed")}</small>;
}

export function MemoryCapabilityOverview({ memory }: MemoryCapabilitySettingsProps) {
  const { t } = useTranslation();
  return <>
    <MemoryLoadFeedback memory={memory} />
    {!memory.loading && memory.items.map((item) => {
      const title = t(`settingsPage.memory.${item.id}.title`);
      const statusID = `settings-overview-memory-${item.id}-status`;
      return <SettingsOverviewRow
        key={item.id}
        title={title}
        description={<>
          {t(`settingsPage.memory.${item.id}.description`)}
          {memory.rowError === item.id && <SaveError />}
        </>}
        control={<>
          <span id={statusID} className="settings-memory-switch-status">{t(item.statusKey)}</span>
          <Switch
            className="settings-ref-switch"
            checked={item.checked}
            disabled={item.disabled}
            loading={memory.saving === item.id}
            aria-label={t("settingsPage.memory.switchAria", { title })}
            aria-describedby={statusID}
            aria-busy={memory.saving === item.id}
            title={item.readonly ? t("settingsPage.memory.readonly") : undefined}
            onChange={(checked: boolean) => void memory.change(item.id, checked)}
          />
        </>}
      />;
    })}
  </>;
}

export default function MemoryCapabilitySettings({ headingRef, memory }: MemoryCapabilitySettingsProps) {
  const { t } = useTranslation();
  const enabledCount = memory.items.filter((item) => item.effective).length;
  return <section className="settings-memory-capabilities" aria-busy={memory.loading}>
    <header className="settings-memory-capabilities-head">
      <span className="settings-memory-capabilities-title-icon" aria-hidden="true"><ToolOutlined /></span>
      <div>
        <h1 ref={headingRef} tabIndex={-1}>{t("settingsPage.memory.title")}</h1>
        <p>{t("settingsPage.memory.description")}</p>
      </div>
      {!memory.loading && !memory.loadError && <Tag className="settings-memory-count">{t("settingsPage.memory.enabledCount", { count: enabledCount })}</Tag>}
    </header>
    <MemoryLoadFeedback memory={memory} />
    {!memory.loading && <div className="settings-memory-capability-list">
      {memory.items.map((item) => {
        const title = t(`settingsPage.memory.${item.id}.title`);
        const statusID = `settings-detail-memory-${item.id}-status`;
        return <article className={`settings-memory-capability-row${item.effective ? " is-enabled" : " is-disabled"}`} key={item.id}>
          <span className="settings-memory-capability-icon" aria-hidden="true"><ToolOutlined /></span>
          <div className="settings-memory-capability-copy">
            <h2>{title}</h2>
            <p>{t(`settingsPage.memory.${item.id}.description`)}</p>
            <span className="settings-memory-capability-meta">{t(`settingsPage.memory.${item.id}.scope`)}<i aria-hidden="true" />{t(`settingsPage.memory.${item.id}.service`)}</span>
            {memory.rowError === item.id && <SaveError />}
          </div>
          <Tag id={statusID} className={`settings-memory-status${item.effective ? " is-enabled" : item.suspended ? " is-suspended" : ""}`}>{t(item.statusKey)}</Tag>
          <Switch
            className="settings-ref-switch"
            checked={item.checked}
            disabled={item.disabled}
            loading={memory.saving === item.id}
            onChange={(checked: boolean) => void memory.change(item.id, checked)}
            aria-label={t("settingsPage.memory.switchAria", { title })}
            aria-describedby={statusID}
            title={item.readonly ? t("settingsPage.memory.readonly") : undefined}
          />
        </article>;
      })}
    </div>}
    <div className="settings-screenreader-status" role="status" aria-live="polite">{memory.saving ? t("settingsPage.memory.savingStatus") : ""}</div>
  </section>;
}
