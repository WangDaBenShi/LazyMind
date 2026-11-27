import { DatabaseOutlined, FolderOpenOutlined, ReadOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";
import type { TFunction } from "i18next";
import type { StructuredAsset } from "@/modules/memory/shared";

interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  destination?: string;
}

export interface ToolGroupDefinition {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  tools: ToolDefinition[];
  destination?: string;
}

export function overviewKnowledgeGroups(t: TFunction): ToolGroupDefinition[] {
  return [
    {
      id: "retrieval",
      title: t("settingsPage.knowledge.groups.retrieval.title"),
      description: t("settingsPage.knowledge.groups.retrieval.description"),
      icon: <ReadOutlined />,
      tools: [
        { id: "kb", name: t("settingsPage.knowledge.groups.retrieval.kb.name"), description: t("settingsPage.knowledge.groups.retrieval.kb.description") },
      ],
    },
    {
      id: "data",
      title: t("settingsPage.knowledge.groups.data.title"),
      description: t("settingsPage.knowledge.groups.data.description"),
      icon: <DatabaseOutlined />,
      tools: [
        { id: "data_sources", name: t("settingsPage.knowledge.groups.data.dataSources.name"), description: t("settingsPage.knowledge.groups.data.dataSources.description") },
        { id: "external_db", name: t("settingsPage.knowledge.groups.data.externalDb.name"), description: t("settingsPage.knowledge.groups.data.externalDb.description") },
      ],
    },
    {
      id: "file-access",
      title: t("settingsPage.knowledge.groups.fileAccess.title"),
      description: t("settingsPage.knowledge.groups.fileAccess.description"),
      icon: <FolderOpenOutlined />,
      tools: [
        { id: "local_fs", name: t("settingsPage.knowledge.groups.fileAccess.localFs.name"), description: t("settingsPage.knowledge.groups.fileAccess.localFs.description") },
        { id: "cloud_files", name: t("settingsPage.knowledge.groups.fileAccess.cloudFiles.name"), description: t("settingsPage.knowledge.groups.fileAccess.cloudFiles.description") },
      ],
    },
  ];
}

export function knowledgeGroupCounts(
  group: ToolGroupDefinition,
  toolsByID: ReadonlyMap<string, StructuredAsset>,
  documentDirectoriesEnabled: boolean,
) {
  const hasDirectories = group.id === "retrieval";
  const registered = group.tools.filter((tool) => toolsByID.has(tool.id)).length + Number(hasDirectories);
  const enabled = group.tools.filter((tool) => toolsByID.get(tool.id)?.isEnabled).length
    + Number(hasDirectories && documentDirectoriesEnabled);
  return { registered, enabled };
}
