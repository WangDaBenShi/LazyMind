import type { ReactNode } from "react";
import { RightOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

export function SettingsOverviewCard({ icon, title, description, children, onDetail }: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
  onDetail: () => void;
}) {
  const { t } = useTranslation();
  return <section className="settings-dashboard-card">
    <header className="settings-dashboard-card-head">
      <span className="settings-section-icon" aria-hidden="true">{icon}</span>
      <div><h3>{title}</h3><p>{description}</p></div>
    </header>
    <div className="settings-dashboard-card-body">{children}</div>
    <footer className="settings-dashboard-card-foot">
      <button type="button" onClick={onDetail} aria-label={t("settingsPage.goToDetailAria", { title })}>
        {t("settingsPage.goToDetail")} <RightOutlined />
      </button>
    </footer>
  </section>;
}

export function SettingsOverviewRow({ title, description, control }: {
  title: string;
  description?: ReactNode;
  control?: ReactNode;
}) {
  return <div className="settings-dashboard-config-row">
    <div className="settings-dashboard-copy">
      <strong>{title}</strong>
      {description && <div className="settings-dashboard-row-description">{description}</div>}
    </div>
    {control != null && <div className="settings-dashboard-control">{control}</div>}
  </div>;
}
