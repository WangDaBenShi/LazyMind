import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tree,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { DataNode } from "antd/es/tree";
import {
  BookOutlined,
  ArrowLeftOutlined,
  CheckCircleFilled,
  ClockCircleFilled,
  DeleteOutlined,
  ExclamationCircleFilled,
  SearchOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Configuration as ScanConfiguration,
  DefaultApi as ScanDefaultApi,
  type Source as ScanSource,
  type SourceDocumentItem as ScanSourceDocumentItem,
  type SourceDocumentsSummary as ScanSourceDocumentsSummary,
  type TreeNode as ScanTreeNode,
} from "@/api/generated/scan-client";
import { BASE_URL, axiosInstance, getLocalizedErrorMessage } from "@/components/request";

import "./detail.scss";

const { Paragraph, Text, Title } = Typography;

type SourceStatus = "active" | "expired" | "error" | "paused";

interface DataSourceSummary {
  id: string;
  name: string;
  target: string;
  documentCount: number;
  status: SourceStatus;
  lastSync: string;
  addCount: number;
  deleteCount: number;
  changeCount: number;
  storageUsed?: string;
  documents?: DocumentStatusRow[];
  scanManaged?: boolean;
  tenantId?: string;
  agentId?: string;
}

interface DataSourceDetailState {
  source?: DataSourceSummary;
}

interface DocumentStatusRow {
  id: string;
  name: string;
  path: string;
  size: string;
  tags: string[];
  updateState: "new" | "changed" | "unchanged" | "deleted";
  syncDetail: string;
  parseStatus: "parsed" | "reindexing" | "duplicate" | "deleted" | "failed";
  sourceUpdatedAt: string;
  updatedAt: string;
}

type SyncStatusFilter = "updated" | "unchanged";

const fallbackSources: Record<
  string,
  DataSourceSummary & { storageUsed: string }
> = {
  "source-feishu-rd": {
    id: "source-feishu-rd",
    name: "飞书研发知识库",
    target: "Wiki://space_rd_platform",
    documentCount: 1284,
    status: "active",
    lastSync: "2026-04-13 10:24",
    addCount: 18,
    deleteCount: 2,
    changeCount: 41,
    storageUsed: "452.8 MB",
  },
  "source-local-ops": {
    id: "source-local-ops",
    name: "运维共享盘",
    target: "/mnt/team-share/ops-docs",
    documentCount: 764,
    status: "active",
    lastSync: "2026-04-13 08:12",
    addCount: 5,
    deleteCount: 0,
    changeCount: 9,
    storageUsed: "218.6 MB",
  },
};

const documentStatusMap: Record<
  string,
  {
    storageUsed: string;
    documents: DocumentStatusRow[];
  }
> = {
  "source-feishu-rd": {
    storageUsed: "452.8 MB",
    documents: [
      {
        id: "fs-1",
        name: "飞书接入开发文档.pdf",
        path: "/接入文档/飞书接入开发文档.pdf",
        size: "1.4 MB",
        tags: ["接入", "飞书"],
        updateState: "changed",
        syncDetail: "内容变更，已完成增量重解析",
        parseStatus: "parsed",
        sourceUpdatedAt: "2026-04-13 10:21",
        updatedAt: "2026-04-13 10:24",
      },
      {
        id: "fs-2",
        name: "OAuth 接口定义说明.docx",
        path: "/接入文档/OAuth 接口定义说明.docx",
        size: "856 KB",
        tags: ["OAuth", "接口"],
        updateState: "new",
        syncDetail: "新文档入库，已生成向量索引",
        parseStatus: "parsed",
        sourceUpdatedAt: "2026-04-13 09:52",
        updatedAt: "2026-04-13 09:58",
      },
      {
        id: "fs-3",
        name: "知识库权限申请流程.md",
        path: "/权限中心/知识库权限申请流程.md",
        size: "122 KB",
        tags: ["权限"],
        updateState: "changed",
        syncDetail: "权限范围更新，等待重建索引",
        parseStatus: "reindexing",
        sourceUpdatedAt: "2026-04-13 09:40",
        updatedAt: "2026-04-13 09:41",
      },
      {
        id: "fs-4",
        name: "旧版连接说明.docx",
        path: "/历史归档/旧版连接说明.docx",
        size: "730 KB",
        tags: ["归档"],
        updateState: "unchanged",
        syncDetail: "检测到重复文档，按多版本策略保留历史版本",
        parseStatus: "duplicate",
        sourceUpdatedAt: "2026-04-11 23:55",
        updatedAt: "2026-04-12 02:01",
      },
    ],
  },
  "source-local-ops": {
    storageUsed: "218.6 MB",
    documents: [
      {
        id: "ops-1",
        name: "巡检标准作业手册.pdf",
        path: "/mnt/team-share/ops-docs/巡检标准作业手册.pdf",
        size: "2.1 MB",
        tags: ["巡检", "SOP"],
        updateState: "changed",
        syncDetail: "内容变更，已完成增量重解析",
        parseStatus: "parsed",
        sourceUpdatedAt: "2026-04-13 08:09",
        updatedAt: "2026-04-13 08:12",
      },
      {
        id: "ops-2",
        name: "应急值班排班.xlsx",
        path: "/mnt/team-share/ops-docs/应急值班排班.xlsx",
        size: "414 KB",
        tags: ["排班"],
        updateState: "new",
        syncDetail: "新文档入库，已完成索引生成",
        parseStatus: "parsed",
        sourceUpdatedAt: "2026-04-13 08:00",
        updatedAt: "2026-04-13 08:05",
      },
      {
        id: "ops-3",
        name: "故障复盘记录.md",
        path: "/mnt/team-share/ops-docs/故障复盘记录.md",
        size: "96 KB",
        tags: ["复盘"],
        updateState: "changed",
        syncDetail: "检测到内容变更，正在重新切分 chunk",
        parseStatus: "reindexing",
        sourceUpdatedAt: "2026-04-13 07:53",
        updatedAt: "2026-04-13 07:58",
      },
      {
        id: "ops-4",
        name: "历史拓扑图.pptx",
        path: "/mnt/team-share/ops-docs/历史拓扑图.pptx",
        size: "8.2 MB",
        tags: ["拓扑", "历史"],
        updateState: "deleted",
        syncDetail: "文件已从源目录删除，等待清理索引",
        parseStatus: "deleted",
        sourceUpdatedAt: "2026-04-12 21:10",
        updatedAt: "2026-04-12 21:16",
      },
    ],
  },
};

function getStatusMeta(status: SourceStatus, t: TFunction) {
  if (status === "active") {
    return { color: "success", text: t("admin.dataSourceStatusActive") };
  }
  if (status === "expired") {
    return { color: "warning", text: t("admin.dataSourceStatusExpired") };
  }
  if (status === "error") {
    return { color: "error", text: t("admin.dataSourceStatusError") };
  }
  return { color: "default", text: t("admin.dataSourceStatusPaused") };
}

function getParseStatusMeta(status: DocumentStatusRow["parseStatus"], t: TFunction) {
  if (status === "parsed") {
    return {
      color: "#12b76a",
      text: t("admin.dataSourceParseParsed"),
      icon: <CheckCircleFilled />,
    };
  }
  if (status === "reindexing") {
    return {
      color: "#1677ff",
      text: t("admin.dataSourceParseReindexing"),
      icon: <SyncOutlined spin />,
    };
  }
  if (status === "duplicate") {
    return {
      color: "#f79009",
      text: t("admin.dataSourceParseDuplicate"),
      icon: <ClockCircleFilled />,
    };
  }
  if (status === "deleted") {
    return {
      color: "#f04438",
      text: t("admin.dataSourceParseDeleted"),
      icon: <DeleteOutlined />,
    };
  }
  return {
    color: "#f04438",
    text: t("admin.dataSourceParseFailed"),
    icon: <ExclamationCircleFilled />,
  };
}

function getUpdateStateMeta(status: DocumentStatusRow["updateState"], t: TFunction) {
  if (status === "new") {
    return {
      text: t("admin.dataSourceFileUpdateNew"),
      detail: t("admin.dataSourceFileUpdateNewDetail"),
      tone: "new" as const,
    };
  }
  if (status === "changed") {
    return {
      text: t("admin.dataSourceFileUpdateChangedDetailTitle"),
      detail: t("admin.dataSourceFileUpdateChangedDetail"),
      tone: "changed" as const,
    };
  }
  if (status === "deleted") {
    return {
      text: t("admin.dataSourceFileUpdateDeletedDetailTitle"),
      detail: t("admin.dataSourceFileUpdateDeletedDetail"),
      tone: "deleted" as const,
    };
  }
  return {
    text: t("admin.dataSourceFileUpdateUnchanged"),
    detail: t("admin.dataSourceFileUpdateUnchangedDetail"),
    tone: "unchanged" as const,
  };
}

function isDocumentNeedSync(status: DocumentStatusRow["updateState"]) {
  return status === "new" || status === "changed" || status === "deleted";
}

function formatNow() {
  const current = new Date();
  const pad = (value: number) => `${value}`.padStart(2, "0");
  return `${current.getFullYear()}-${pad(current.getMonth() + 1)}-${pad(
    current.getDate(),
  )} ${pad(current.getHours())}:${pad(current.getMinutes())}`;
}

function getDirectoryLabel(path: string, sourceName: string) {
  const segments = path.split("/").filter(Boolean);
  if (segments.length <= 1) {
    return sourceName;
  }
  return segments.length > 2 ? segments[segments.length - 2] : segments[0];
}

function getDocumentType(name: string) {
  const [, extension = "unknown"] = name.split(/\.(?=[^.]+$)/);
  return extension.toLowerCase();
}

function createScanApiClient() {
  const baseUrl = BASE_URL || window.location.origin;
  return new ScanDefaultApi(
    new ScanConfiguration({
      basePath: baseUrl,
      baseOptions: {
        headers: { "Content-Type": "application/json" },
      },
    }),
    baseUrl,
    axiosInstance,
  );
}

function formatDateTime(value?: string) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const pad = (input: number) => `${input}`.padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function mapScanSourceStatus(
  status?: string,
  watchEnabled?: boolean,
): SourceStatus {
  const normalized = (status || "").toLowerCase();
  if (
    normalized.includes("error") ||
    normalized.includes("failed") ||
    normalized.includes("invalid")
  ) {
    return "error";
  }
  if (
    normalized.includes("disabled") ||
    normalized.includes("pause") ||
    normalized.includes("stopped") ||
    watchEnabled === false
  ) {
    return "paused";
  }
  return "active";
}

function mapScanUpdateState(
  updateType?: string,
  hasUpdate?: boolean,
): DocumentStatusRow["updateState"] {
  const normalized = (updateType || "").toLowerCase();
  if (normalized.includes("delete")) {
    return "deleted";
  }
  if (normalized.includes("new") || normalized.includes("add")) {
    return "new";
  }
  if (
    normalized.includes("modify") ||
    normalized.includes("change") ||
    normalized.includes("update")
  ) {
    return "changed";
  }
  return hasUpdate ? "changed" : "unchanged";
}

function mapScanParseStatus(parseState?: string): DocumentStatusRow["parseStatus"] {
  const normalized = (parseState || "").toLowerCase();
  if (
    normalized.includes("parsed") ||
    normalized.includes("success") ||
    normalized.includes("done")
  ) {
    return "parsed";
  }
  if (normalized.includes("reindex") || normalized.includes("running")) {
    return "reindexing";
  }
  if (normalized.includes("duplicate")) {
    return "duplicate";
  }
  if (normalized.includes("delete") || normalized.includes("removed")) {
    return "deleted";
  }
  return "failed";
}

function mapScanSyncDetail(updateState: DocumentStatusRow["updateState"]) {
  if (updateState === "new") {
    return "新文件待入库";
  }
  if (updateState === "changed") {
    return "内容变化待重解析";
  }
  if (updateState === "deleted") {
    return "源端删除待清理";
  }
  return "当前文件已是最新";
}

function mapScanDocumentToDetail(item: ScanSourceDocumentItem): DocumentStatusRow {
  const updateState = mapScanUpdateState(item.update_type, item.has_update);
  const lastSyncedAt = formatDateTime(item.last_synced_at);
  return {
    id: `${item.document_id}`,
    name: item.name,
    path: item.path,
    size: formatBytes(item.size_bytes),
    tags: item.tags || [],
    updateState,
    syncDetail: item.update_desc || mapScanSyncDetail(updateState),
    parseStatus: mapScanParseStatus(item.parse_state),
    sourceUpdatedAt: lastSyncedAt || "-",
    updatedAt: lastSyncedAt || "-",
  };
}

function buildDetailSummaryFromSource(
  source: ScanSource,
  summary: ScanSourceDocumentsSummary | undefined,
  documents: DocumentStatusRow[],
): DataSourceSummary {
  const lastSync = formatDateTime(source.updated_at) || "-";
  return {
    id: source.id,
    name: source.name,
    target: source.root_path,
    documentCount: summary?.total_document_count || documents.length,
    status: mapScanSourceStatus(source.status, source.watch_enabled),
    lastSync,
    addCount: summary?.new_count || 0,
    deleteCount: summary?.deleted_count || 0,
    changeCount: summary?.modified_count || 0,
    storageUsed: formatBytes(summary?.storage_bytes),
    documents,
    scanManaged: true,
    tenantId: source.tenant_id,
    agentId: source.agent_id,
  };
}

function isTreeNodeUpdated(node: ScanTreeNode) {
  if (node.has_update === true) {
    return true;
  }
  const normalized = (node.update_type || "").toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized.includes("unchanged") || normalized.includes("none")) {
    return false;
  }
  return true;
}

function filterScanTreeNodes(
  nodes: ScanTreeNode[],
  keyword: string,
  statusFilter: SyncStatusFilter,
): ScanTreeNode[] {
  const normalizedKeyword = keyword.trim().toLowerCase();

  const walk = (items: ScanTreeNode[]): ScanTreeNode[] =>
    items
      .map((node) => {
        const children = node.children ? walk(node.children) : [];
        const titleMatched =
          !normalizedKeyword ||
          node.title.toLowerCase().includes(normalizedKeyword) ||
          node.key.toLowerCase().includes(normalizedKeyword);

        if (node.is_dir) {
          if (children.length > 0 || titleMatched) {
            return {
              ...node,
              children: children.length > 0 ? children : undefined,
            };
          }
          return null;
        }

        const isUpdated = isTreeNodeUpdated(node);
        const statusMatched =
          statusFilter === "updated" ? isUpdated : !isUpdated;
        if (!titleMatched || !statusMatched) {
          return null;
        }

        return {
          ...node,
          children: undefined,
        };
      })
      .filter(Boolean) as ScanTreeNode[];

  return walk(nodes);
}

function collectScanTreeFileKeys(nodes: ScanTreeNode[]): string[] {
  const keys: string[] = [];
  const walk = (items: ScanTreeNode[]) => {
    items.forEach((node) => {
      if (node.is_dir) {
        if (node.children?.length) {
          walk(node.children);
        }
        return;
      }
      keys.push(node.key);
    });
  };
  walk(nodes);
  return keys;
}

function collectScanTreeNodeKeys(nodes: ScanTreeNode[]): string[] {
  const keys: string[] = [];
  const walk = (items: ScanTreeNode[]) => {
    items.forEach((node) => {
      keys.push(node.key);
      if (node.children?.length) {
        walk(node.children);
      }
    });
  };
  walk(nodes);
  return keys;
}

function shouldPollByParseStatus(items: DocumentStatusRow[]) {
  return items.some(
    (item) => item.parseStatus !== "parsed" && item.parseStatus !== "failed",
  );
}

export default function DataSourceDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const location = useLocation();
  const [keyword, setKeyword] = useState("");

  const routeState = location.state as DataSourceDetailState | null;
  const routeSource = routeState?.source;
  const fallbackSource = fallbackSources[id];
  const initialSource = routeSource
    ? {
        ...routeSource,
        storageUsed: routeSource.storageUsed || documentStatusMap[routeSource.id]?.storageUsed || fallbackSource?.storageUsed || "0 B",
      }
    : fallbackSource;

  const initialDocumentsSeed =
    routeSource?.documents || (initialSource && documentStatusMap[initialSource.id]?.documents) || [];
  const [detailSource, setDetailSource] = useState<DataSourceSummary | undefined>(initialSource);
  const [documents, setDocuments] = useState<DocumentStatusRow[]>(initialDocumentsSeed);
  const [detailLoading, setDetailLoading] = useState(true);
  const [syncSelectedDocIds, setSyncSelectedDocIds] = useState<string[]>([]);
  const [syncPickerOpen, setSyncPickerOpen] = useState(false);
  const [syncTreeNodes, setSyncTreeNodes] = useState<ScanTreeNode[]>([]);
  const [syncTreeLoading, setSyncTreeLoading] = useState(false);
  const [syncSelectionToken, setSyncSelectionToken] = useState<string>("");
  const [syncSubmitting, setSyncSubmitting] = useState(false);
  const [syncKeyword, setSyncKeyword] = useState("");
  const [syncStatusFilter, setSyncStatusFilter] =
    useState<SyncStatusFilter>("updated");
  const [lastSync, setLastSync] = useState(
    initialSource?.lastSync || t("admin.dataSourceNeverSynced"),
  );
  const [lastOperation, setLastOperation] = useState<{
    syncedCount: number;
    ignoredCount: number;
    checkedCount: number;
    time: string;
  } | null>(null);
  const syncPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncPollingActiveRef = useRef(false);

  const stopSyncPolling = useCallback(() => {
    syncPollingActiveRef.current = false;
    if (syncPollTimerRef.current) {
      clearTimeout(syncPollTimerRef.current);
      syncPollTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    stopSyncPolling();
    setDetailSource(initialSource);
    setDocuments(initialDocumentsSeed);
    setSyncSelectedDocIds([]);
    setSyncPickerOpen(false);
    setSyncTreeNodes([]);
    setSyncTreeLoading(false);
    setSyncSelectionToken("");
    setSyncSubmitting(false);
    setLastOperation(null);
  }, [id, routeSource?.id, routeSource?.lastSync, stopSyncPolling]);

  useEffect(() => {
    setLastSync(detailSource?.lastSync || t("admin.dataSourceNeverSynced"));
  }, [detailSource?.lastSync, t]);

  useEffect(() => () => {
    stopSyncPolling();
  }, [stopSyncPolling]);

  const refreshDetailFromServer = useCallback(
    async ({
      setLoading = false,
      showError = true,
      resetSyncState = false,
    }: {
      setLoading?: boolean;
      showError?: boolean;
      resetSyncState?: boolean;
    } = {}): Promise<DocumentStatusRow[] | null> => {
      if (!id) {
        return [];
      }

      if (setLoading) {
        setDetailLoading(true);
      }

      try {
        const client = createScanApiClient();
        const sourceResponse = await client.apiScanSourcesIdGet({ id });
        const source = sourceResponse.data;
        const tenantId = source.tenant_id || routeSource?.tenantId;

        if (!tenantId) {
          throw new Error("缺少 tenant_id，无法加载数据源详情。");
        }

        const documentsResponse = await client.apiScanSourcesIdDocumentsGet({
          id,
          tenantId,
          page: 1,
          pageSize: 200,
        });
        const nextDocuments = (documentsResponse.data.items || []).map(
          mapScanDocumentToDetail,
        );
        const nextSource = buildDetailSummaryFromSource(
          source,
          documentsResponse.data.summary,
          nextDocuments,
        );

        setDetailSource(nextSource);
        setDocuments(nextDocuments);
        setLastSync(nextSource.lastSync || t("admin.dataSourceNeverSynced"));
        if (resetSyncState) {
          setSyncSelectedDocIds([]);
          setSyncPickerOpen(false);
        }

        return nextDocuments;
      } catch (error) {
        if (showError) {
          message.error(
            getLocalizedErrorMessage(error, t("common.requestFailed")) ||
              t("common.requestFailed"),
          );
        }
        return null;
      } finally {
        if (setLoading) {
          setDetailLoading(false);
        }
      }
    },
    [id, routeSource?.tenantId, t],
  );

  useEffect(() => {
    let cancelled = false;

    const loadDetail = async () => {
      const nextDocuments = await refreshDetailFromServer({
        setLoading: true,
        showError: !cancelled,
        resetSyncState: true,
      });
      if (cancelled || nextDocuments === null) {
        return;
      }
    };

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [refreshDetailFromServer]);

  const filteredDocuments = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) {
      return documents;
    }

    return documents.filter(
      (item) =>
        item.name.toLowerCase().includes(normalized) ||
        item.path.toLowerCase().includes(normalized) ||
        item.syncDetail.toLowerCase().includes(normalized),
    );
  }, [documents, keyword]);

  const pendingDocumentsCount = documents.filter((item) =>
    isDocumentNeedSync(item.updateState),
  ).length;
  const newDocumentsCount = documents.filter((item) => item.updateState === "new").length;
  const changedDocumentsCount = documents.filter(
    (item) => item.updateState === "changed",
  ).length;
  const deletedDocumentsCount = documents.filter(
    (item) => item.updateState === "deleted",
  ).length;
  const sourceNameForPath = detailSource?.name || t("admin.dataSourceFallbackName");

  const openSyncPicker = async () => {
    if (!detailSource?.agentId) {
      message.error("未获取到扫描 Agent 信息，无法加载目录树。");
      return;
    }

    if (!detailSource.target) {
      message.error("未获取到同步路径，无法加载目录树。");
      return;
    }

    setSyncKeyword("");
    setSyncStatusFilter("updated");
    setSyncPickerOpen(true);
    setSyncTreeLoading(true);
    setSyncSelectedDocIds([]);

    try {
      const client = createScanApiClient();
      const response = await client.apiScanAgentsFsTreePost({
        agentPathTreeRequest: {
          agent_id: detailSource.agentId,
          source_id: detailSource.id,
          path: detailSource.target,
          include_files: true,
          changes_only: false,
          max_depth: 8,
        },
      });

      const nextTreeNodes = response.data.items || [];
      const nextSelectionToken = response.data.selection_token || "";
      const defaultSelected = collectScanTreeFileKeys(
        filterScanTreeNodes(nextTreeNodes, "", "updated"),
      );

      setSyncTreeNodes(nextTreeNodes);
      setSyncSelectionToken(nextSelectionToken);
      setSyncSelectedDocIds(defaultSelected);
    } catch (error) {
      message.error(
        getLocalizedErrorMessage(error, t("common.requestFailed")) ||
          t("common.requestFailed"),
      );
      setSyncPickerOpen(false);
    } finally {
      setSyncTreeLoading(false);
    }
  };

  const runSyncPipeline = async (targetDocumentIds: string[]) => {
    if (targetDocumentIds.length === 0) {
      message.warning(t("admin.dataSourceDetailSelectFileFirst"));
      return false;
    }

    if (!detailSource?.id) {
      message.error("未获取到数据源信息，无法发起拉取。");
      return false;
    }

    const targetSet = new Set(targetDocumentIds);
    const targetPaths = Array.from(targetSet);
    const currentTime = formatNow();

    stopSyncPolling();
    setSyncSubmitting(true);
    try {
      const client = createScanApiClient();
      const generateTasksRequest: {
        mode: string;
        paths: string[];
        updated_only?: boolean;
        selection_token?: string;
      } = {
        mode: "manual_pull",
        paths: targetPaths,
        updated_only: syncStatusFilter === "updated",
      };
      if (syncSelectionToken) {
        generateTasksRequest.selection_token = syncSelectionToken;
      }

      const generateResponse = await client.apiScanSourcesIdTasksGeneratePost({
        id: detailSource.id,
        generateTasksRequest,
      });
      const result = generateResponse.data;
      const checkedCount = result.requested_count ?? targetPaths.length;
      const syncedCount = result.accepted_count ?? 0;
      const ignoredCount =
        result.ignored_unchanged_count ??
        result.skipped_count ??
        Math.max(checkedCount - syncedCount, 0);

      const checkedRows = documents.filter(
        (item) => targetSet.has(item.id) || targetSet.has(item.path),
      );
      const hasDocumentMatch = checkedRows.length > 0;

      if (hasDocumentMatch) {
        setDocuments((prev) =>
          prev
            .map((item) => {
              if (
                (!targetSet.has(item.id) && !targetSet.has(item.path)) ||
                !isDocumentNeedSync(item.updateState)
              ) {
                return item;
              }

              if (item.updateState === "deleted") {
                return null;
              }

              return {
                ...item,
                updateState: "unchanged",
                parseStatus: "parsed",
                syncDetail: t("admin.dataSourceDetailManualSyncDone"),
                updatedAt: currentTime,
              };
            })
            .filter(Boolean) as DocumentStatusRow[],
        );
      }

      setLastSync(currentTime);
      setLastOperation({
        syncedCount,
        ignoredCount,
        checkedCount,
        time: currentTime,
      });

      if (syncedCount === 0) {
        message.info(
          t("admin.dataSourceDetailSyncNoChange", { checkedCount }),
        );
      } else {
        message.success(
          t("admin.dataSourceDetailSyncDone", {
            syncedCount,
            ignoredCount,
          }),
        );
      }

      setSyncSelectedDocIds([]);

      const refreshedDocuments = await refreshDetailFromServer({
        setLoading: false,
        showError: true,
        resetSyncState: false,
      });
      if (refreshedDocuments && shouldPollByParseStatus(refreshedDocuments)) {
        syncPollingActiveRef.current = true;

        const pollOnce = async () => {
          if (!syncPollingActiveRef.current) {
            return;
          }

          const latestDocuments = await refreshDetailFromServer({
            setLoading: false,
            showError: false,
            resetSyncState: false,
          });
          if (!syncPollingActiveRef.current) {
            return;
          }

          if (latestDocuments && !shouldPollByParseStatus(latestDocuments)) {
            stopSyncPolling();
            return;
          }

          syncPollTimerRef.current = setTimeout(pollOnce, 3000);
        };

        syncPollTimerRef.current = setTimeout(pollOnce, 3000);
      }

      return true;
    } catch (error) {
      stopSyncPolling();
      message.error(
        getLocalizedErrorMessage(error, t("common.requestFailed")) ||
          t("common.requestFailed"),
      );
      return false;
    } finally {
      setSyncSubmitting(false);
    }
  };

  const filteredSyncTreeNodes = useMemo(
    () => filterScanTreeNodes(syncTreeNodes, syncKeyword, syncStatusFilter),
    [syncTreeNodes, syncKeyword, syncStatusFilter],
  );

  const syncTreeData = useMemo<DataNode[]>(() => {
    const toDataNode = (nodes: ScanTreeNode[]): DataNode[] =>
      nodes.map((node) => {
        const children = node.children ? toDataNode(node.children) : undefined;
        const updated = isTreeNodeUpdated(node);

        return {
          key: node.key,
          isLeaf: !node.is_dir,
          disableCheckbox: !node.is_dir && node.selectable === false,
          title: node.is_dir ? (
            <span>{node.title}</span>
          ) : (
            <div className="data-source-sync-tree-file">
              <div className="data-source-sync-tree-file-main">
                <span>{node.title}</span>
                {updated ? (
                  <span className="data-source-sync-tree-chip data-source-sync-tree-chip-changed">
                    {t("admin.dataSourceFileUpdateChanged")}
                  </span>
                ) : null}
              </div>
            </div>
          ),
          children,
        };
      });

    return toDataNode(filteredSyncTreeNodes);
  }, [filteredSyncTreeNodes, t]);

  const checkedTreeKeys = syncSelectedDocIds;
  const filteredSyncNodeKeys = useMemo(
    () => collectScanTreeNodeKeys(filteredSyncTreeNodes),
    [filteredSyncTreeNodes],
  );
  const hasFilteredSelected = filteredSyncNodeKeys.some((id) =>
    syncSelectedDocIds.includes(id),
  );

  const columns: ColumnsType<DocumentStatusRow> = [
    {
      title: t("admin.dataSourceDetailTableDocName"),
      dataIndex: "name",
      key: "name",
      width: 360,
      render: (_value, record) => (
        <div className="data-source-detail-doc">
          <div className="data-source-detail-doc-name">
            <BookOutlined />
            <span>{record.name}</span>
          </div>
          <div className="data-source-detail-doc-path">{record.path}</div>
        </div>
      ),
    },
    {
      title: t("admin.dataSourceDetailTableTags"),
      dataIndex: "tags",
      key: "tags",
      width: 160,
      render: (tags: string[]) =>
        tags.length ? (
          <div className="data-source-detail-tags">
            {tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </div>
        ) : (
          "-"
        ),
    },
    {
      title: t("admin.dataSourceDetailTableDirectory"),
      dataIndex: "path",
      key: "path",
      width: 160,
      render: (path: string) => getDirectoryLabel(path, sourceNameForPath),
    },
    {
      title: t("admin.dataSourceDetailTableUpdateState"),
      dataIndex: "updateState",
      key: "updateState",
      width: 220,
      render: (updateState: DocumentStatusRow["updateState"]) => {
        const meta = getUpdateStateMeta(updateState, t);
        return (
          <div className="data-source-detail-update-state">
            <span className={`data-source-update-chip data-source-update-chip-${meta.tone}`}>
              <span className="data-source-update-chip-dot" />
              {meta.text}
            </span>
            <Text type="secondary">{meta.detail}</Text>
          </div>
        );
      },
    },
    {
      title: t("admin.dataSourceDetailTableParseStatus"),
      dataIndex: "parseStatus",
      key: "parseStatus",
      width: 140,
      render: (parseStatus: DocumentStatusRow["parseStatus"], record) => {
        const meta = getParseStatusMeta(parseStatus, t);
        return (
          <Tag
            color={
              parseStatus === "parsed"
                ? "success"
                : parseStatus === "reindexing"
                  ? "processing"
                  : parseStatus === "duplicate"
                    ? "warning"
                    : "error"
            }
            title={record.syncDetail}
          >
            {meta.text}
          </Tag>
        );
      },
    },
    {
      title: t("admin.dataSourceDetailTableDocType"),
      dataIndex: "name",
      key: "docType",
      width: 120,
      render: (name: string) => getDocumentType(name),
    },
    {
      title: t("admin.dataSourceDetailTableSize"),
      dataIndex: "size",
      key: "size",
      width: 120,
      render: (size: string) => (
        <Text className="data-source-detail-size" type="secondary">
          {size}
        </Text>
      ),
    },
    {
      title: t("admin.dataSourceDetailTableSourceUpdatedAt"),
      dataIndex: "sourceUpdatedAt",
      key: "sourceUpdatedAt",
      width: 180,
    },
    {
      title: t("admin.dataSourceDetailTableUpdatedAt"),
      dataIndex: "updatedAt",
      key: "updatedAt",
      width: 180,
    },
  ];

  if (!detailSource && detailLoading) {
    return (
      <div className="admin-page data-source-detail-page">
        <Button
          type="link"
          icon={<ArrowLeftOutlined />}
          className="data-source-detail-back"
          onClick={() => navigate("/admin/data-sources")}
        >
          {t("admin.dataSourceBackToList")}
        </Button>
        <Card loading />
      </div>
    );
  }

  if (!detailSource) {
    return (
      <div className="admin-page data-source-detail-page">
        <Button
          type="link"
          icon={<ArrowLeftOutlined />}
          className="data-source-detail-back"
          onClick={() => navigate("/admin/data-sources")}
        >
          {t("admin.dataSourceBackToList")}
        </Button>
        <Card>
          <Empty description={t("admin.dataSourceDetailNotFound")} />
        </Card>
      </div>
    );
  }

  const statusMeta = getStatusMeta(detailSource.status, t);

  return (
    <div className="admin-page data-source-detail-page">
      <Button
        type="link"
        icon={<ArrowLeftOutlined />}
        className="data-source-detail-back"
        onClick={() => navigate("/admin/data-sources")}
      >
        {t("admin.dataSourceBackToList")}
      </Button>

      <div className="data-source-detail-header">
        <Space align="center" size={16} wrap>
          <Title level={2} className="data-source-detail-title">
            {detailSource.name}
          </Title>
          <Tag color={statusMeta.color} className="data-source-detail-title-tag">
            {statusMeta.text}
          </Tag>
        </Space>
        <Paragraph className="data-source-detail-description">
          {t("admin.dataSourceDetailLastSync", { time: lastSync })}
        </Paragraph>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card className="data-source-detail-stat-card">
            <Text className="data-source-detail-stat-label">
              {t("admin.dataSourceDetailSyncPath")}
            </Text>
            <div className="data-source-detail-stat-value path">
              {detailSource.target}
            </div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="data-source-detail-stat-card">
            <Text className="data-source-detail-stat-label">
              {t("admin.dataSourceDetailParsedDocs")}
            </Text>
            <div className="data-source-detail-stat-value">
              {documents.length}
              <span>{t("admin.dataSourceDetailFileUnit")}</span>
            </div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="data-source-detail-stat-card">
            <Text className="data-source-detail-stat-label">
              {t("admin.dataSourceDetailStorageUsed")}
            </Text>
            <div className="data-source-detail-stat-value">
              {detailSource.storageUsed}
            </div>
          </Card>
        </Col>
      </Row>

      <Card
        className="data-source-detail-change-card"
        bodyStyle={{ paddingBottom: 12 }}
      >
        <Space wrap size={[12, 12]}>
          <Tag color="green">{t("admin.dataSourceDetailTagNew", { count: newDocumentsCount })}</Tag>
          <Tag color="blue">
            {t("admin.dataSourceDetailTagChanged", { count: changedDocumentsCount })}
          </Tag>
          <Tag color="red">
            {t("admin.dataSourceDetailTagDeleted", { count: deletedDocumentsCount })}
          </Tag>
          <Tag color={pendingDocumentsCount > 0 ? "warning" : "default"}>
            {t("admin.dataSourceDetailTagPending", { count: pendingDocumentsCount })}
          </Tag>
          <Tag>{t("admin.dataSourceDetailTagTotal", { count: documents.length })}</Tag>
        </Space>
      </Card>

      <Alert
        showIcon
        type="info"
        message={t("admin.dataSourceDetailExecutionTitle")}
        description={t("admin.dataSourceDetailExecutionDesc")}
      />

      {lastOperation && (
        <Alert
          showIcon
          type={lastOperation.syncedCount > 0 ? "success" : "warning"}
          message={t("admin.dataSourceDetailLastManualPull")}
          description={t("admin.dataSourceDetailLastManualPullDesc", {
            time: lastOperation.time,
            checked: lastOperation.checkedCount,
            synced: lastOperation.syncedCount,
            ignored: lastOperation.ignoredCount,
          })}
        />
      )}

      <Card
        title={t("admin.dataSourceDetailDocChangeTitle")}
        extra={
          <Space wrap>
            <Button
              type="primary"
              loading={detailLoading}
              disabled={detailLoading}
              onClick={openSyncPicker}
            >
              {t("admin.dataSourceDetailSyncNow")}
            </Button>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder={t("admin.dataSourceDetailSearchDocPlaceholder")}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              className="data-source-detail-search"
            />
          </Space>
        }
      >
        <Table<DocumentStatusRow>
          rowKey="id"
          columns={columns}
          dataSource={filteredDocuments}
          loading={detailLoading}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          className="admin-page-table data-source-detail-table"
          locale={{ emptyText: t("admin.dataSourceDetailNoDocStatus") }}
          scroll={{ x: 1520 }}
        />
      </Card>

      <Modal
        title={t("admin.dataSourceDetailManualPullTitle")}
        open={syncPickerOpen}
        onCancel={() => {
          if (!syncSubmitting) {
            setSyncPickerOpen(false);
          }
        }}
        okText={t("admin.dataSourceDetailStartPull", { count: syncSelectedDocIds.length })}
        okButtonProps={{ disabled: syncSelectedDocIds.length === 0 || syncSubmitting, loading: syncSubmitting }}
        onOk={async () => {
          const finished = await runSyncPipeline(syncSelectedDocIds);
          if (finished) {
            setSyncPickerOpen(false);
          }
        }}
        width={860}
        destroyOnClose
      >
        <div className="data-source-sync-picker">
          <Space wrap className="data-source-sync-picker-filters">
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder={t("admin.dataSourceDetailSearchInModalPlaceholder")}
              value={syncKeyword}
              onChange={(event) => setSyncKeyword(event.target.value)}
              className="data-source-sync-picker-keyword"
            />
            <Space wrap className="data-source-sync-picker-actions">
              <Select<SyncStatusFilter>
                value={syncStatusFilter}
                className="data-source-sync-picker-status"
                onChange={setSyncStatusFilter}
                options={[
                  { label: t("admin.dataSourceDetailFilterUpdated"), value: "updated" },
                  { label: t("admin.dataSourceDetailFilterUnchanged"), value: "unchanged" },
                ]}
              />
              {hasFilteredSelected ? (
                <Button
                  onClick={() =>
                    setSyncSelectedDocIds((prev) =>
                      prev.filter((id) => !filteredSyncNodeKeys.includes(id)),
                    )
                  }
                  disabled={filteredSyncNodeKeys.length === 0}
                >
                  {t("chat.cancelSelectAll")}
                </Button>
              ) : (
                <Button
                  onClick={() => setSyncSelectedDocIds(filteredSyncNodeKeys)}
                  disabled={filteredSyncNodeKeys.length === 0}
                >
                  {t("chat.selectAll")}
                </Button>
              )}
            </Space>
          </Space>

          <Alert
            showIcon
            type="info"
            message={t("admin.dataSourceDetailTreeSelectTitle")}
            description={t("admin.dataSourceDetailTreeSelectDesc")}
          />

          {syncTreeLoading ? (
            <div className="data-source-sync-tree-loading">加载目录树中...</div>
          ) : syncTreeData.length > 0 ? (
            <Tree
              checkable
              defaultExpandAll
              checkedKeys={checkedTreeKeys}
              treeData={syncTreeData}
              className="data-source-sync-tree"
              onCheck={(keys) => {
                const nextKeys = Array.isArray(keys) ? keys : keys.checked;
                setSyncSelectedDocIds(nextKeys.map((key) => `${key}`));
              }}
            />
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t("admin.dataSourceDetailNoMatchedFile")}
            />
          )}
        </div>
      </Modal>
    </div>
  );
}
