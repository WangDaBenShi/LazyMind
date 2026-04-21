import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Steps,
  Switch,
  Table,
  Tag,
  Tooltip,
  Upload,
  type UploadProps,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  AppstoreOutlined,
  BookOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  HistoryOutlined,
  LinkOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  ToolOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import SendIcon from "@/modules/chat/assets/icons/send_icon.svg?react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { diffLines } from "diff";
import type { GroupItem, UserItem } from "@/api/generated/auth-client";
import { createGroupApi, createUserApi } from "@/modules/signin/utils/request";

import "./index.scss";

type MemoryTab = "tools" | "skills" | "experience" | "glossary";
type ModalMode = "add" | "edit" | "view";
type ShareableTab = "skills" | "experience";
type ChangeProposalTab = Extract<MemoryTab, "skills" | "experience">;
type GlossarySource = "user" | "ai" | "system";

interface BaseAsset {
  id: string;
  content: string;
  protect?: boolean;
}

interface StructuredAsset extends BaseAsset {
  name: string;
  description: string;
  category: string;
  tags: string[];
  parentId?: string;
}

interface ExperienceAsset extends BaseAsset {
  title: string;
}

interface GlossaryAsset extends BaseAsset {
  term: string;
  aliases: string[];
  source: GlossarySource;
}

interface GlossaryChangeProposal {
  id: string;
  targetId: string;
  before: GlossaryAsset | null;
  after: GlossaryAsset;
  reason: string;
  mergeFrom?: [GlossaryAsset, GlossaryAsset];
}

interface AssetDraft {
  id?: string;
  title: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  parentId: string;
  childSkills: ChildSkillDraft[];
  term: string;
  aliases: string[];
  source: GlossarySource;
  content: string;
  protect: boolean;
}

interface SkillTreeNode extends StructuredAsset {
  children?: SkillTreeNode[];
}

interface ChildSkillDraft {
  tempId: string;
  name: string;
  content: string;
}

interface ShareRecord {
  groupIds: string[];
  userIds: string[];
}

interface ShareTarget {
  tab: ShareableTab;
  item: StructuredAsset | ExperienceAsset;
}

interface StructuredChangeProposal {
  id: string;
  tab: "skills";
  targetId: string;
  before: StructuredAsset;
  after: StructuredAsset;
}

interface ExperienceChangeProposal {
  id: string;
  tab: "experience";
  targetId: string;
  before: ExperienceAsset;
  after: ExperienceAsset;
}

type ChangeProposal = StructuredChangeProposal | ExperienceChangeProposal;

type DiffLineType = "add" | "remove" | "same";

interface DiffLine {
  type: DiffLineType;
  text: string;
}

type ProposalFieldKey =
  | "name"
  | "description"
  | "category"
  | "tags"
  | "content"
  | "protect"
  | "title";

type ProposalFieldDecision = "accept" | "reject" | "pending";

interface ProposalFieldChange {
  key: ProposalFieldKey;
  label: string;
  before: string;
  after: string;
}

const createDraft = (): AssetDraft => ({
  title: "",
  name: "",
  description: "",
  category: "",
  tags: [],
  parentId: "",
  childSkills: [],
  term: "",
  aliases: [],
  source: "user",
  content: "",
  protect: false,
});

const createChildSkillDraft = (): ChildSkillDraft => ({
  tempId: createId("child-skill"),
  name: "",
  content: "",
});

const skillUploadAccept = ".md,.markdown,.txt,.json,.yaml,.yml";
const skillUploadSuffixes = ["md", "markdown", "txt", "json", "yaml", "yml"];
const getBaseName = (filename: string) => filename.replace(/\.[^/.]+$/, "");
const canUploadSkillFile = (filename: string) => {
  const lowerName = filename.toLowerCase();
  return skillUploadSuffixes.some((suffix) => lowerName.endsWith(`.${suffix}`));
};

const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const initialTools: StructuredAsset[] = [
  {
    id: "tool-geology-api",
    name: "geology_api",
    description: "国家地质灾害数据库检索能力，提供统一只读查询入口。",
    category: "基础工具",
    tags: ["data", "api", "只读"],
    content:
      "SYSTEM_CALL_V1\n- connect: geology-disaster-index\n- quota: shared\n- guard: readonly",
  },
  {
    id: "tool-doc-parser",
    name: "doc_parser_pipeline",
    description: "多格式文档解析与结构化抽取，用于知识入库前清洗。",
    category: "预处理",
    tags: ["parser", "ocr", "document"],
    content:
      "PIPELINE\n1. detect format\n2. ocr / parse\n3. segment\n4. normalize metadata",
  },
];

const initialSkills: StructuredAsset[] = [
  {
    id: "skill-railway-sop",
    name: "railway_geology_knowledge_base",
    description: "铁路地质标准知识库，聚合巡检、核查与研判类 SOP。",
    category: "铁路地质",
    tags: ["知识库", "SOP"],
    content:
      "# 铁路地质知识库\n\n- 下挂核查子技能\n- 统一标准口径与输出格式",
    protect: true,
  },
  {
    id: "skill-railway-check",
    name: "railway_rockpile_check",
    description: "铁路岩堆体地质核查标准 SOP，覆盖现场核验与风险结论输出。",
    category: "铁路地质",
    tags: ["SOP", "不良地质", "核查"],
    content:
      "# 铁路核查标准\n\n- 识别边坡、岩堆体与冲沟发育情况\n- 输出风险分级、处治建议与复核结论",
    protect: true,
    parentId: "skill-railway-sop",
  },
  {
    id: "skill-emergency-qa",
    name: "emergency_report_triage",
    description: "突发事件报告分诊模板，用于归纳事件等级、影响范围与升级路径。",
    category: "应急处置",
    tags: ["模板", "研判", "事件流转"],
    content:
      "# 分诊框架\n\n- 事件类型\n- 风险等级\n- 通知对象\n- 建议动作\n- 缺失信息",
    protect: false,
  },
];

const initialExperience: ExperienceAsset[] = [
  {
    id: "exp-style-first",
    title: "回复风格偏好",
    content: "倾向于先结论后论证，遇到风险点时优先列出明确建议。",
    protect: false,
  },
  {
    id: "exp-output-structured",
    title: "输出结构偏好",
    content: "在复杂分析场景下，优先采用要点化表达，并保留可追溯的判断依据。",
    protect: true,
  },
];

const initialGlossary: GlossaryAsset[] = [
  {
    id: "glossary-rainfall-threshold",
    term: "雨强阈值",
    aliases: ["降雨阈值", "触发雨量阈值"],
    source: "user",
    content: "用于判定地质灾害预警等级的降雨强度临界值。",
    protect: false,
  },
  {
    id: "glossary-rock-pile",
    term: "岩堆体",
    aliases: ["崩塌堆积体", "松散堆积体"],
    source: "system",
    content: "常见不良地质体，检索阶段需与边坡失稳风险词联动。",
    protect: true,
  },
  {
    id: "glossary-chainage",
    term: "里程桩号",
    aliases: ["桩号", "线路里程"],
    source: "ai",
    content: "用于定位铁路线路具体位置的标准标识，通常格式为 Kxx+xxx。",
    protect: false,
  },
];

const cloneStructuredAsset = (item: StructuredAsset): StructuredAsset => ({
  ...item,
  tags: [...item.tags],
});

const cloneExperienceAsset = (item: ExperienceAsset): ExperienceAsset => ({
  ...item,
});

const cloneGlossaryAsset = (item: GlossaryAsset): GlossaryAsset => ({
  ...item,
  aliases: [...item.aliases],
});

interface StructuredDiffLabels {
  name: string;
  description: string;
  category: string;
  tags: string;
  protect: string;
  content: string;
  yes: string;
  no: string;
}

interface ExperienceDiffLabels {
  title: string;
  protect: string;
  content: string;
  yes: string;
  no: string;
}

const serializeStructuredAsset = (
  item: StructuredAsset,
  labels: StructuredDiffLabels,
) => {
  const tags = item.tags.length ? item.tags.join(", ") : "-";
  const lines = [
    `${labels.name}: ${item.name}`,
    `${labels.description}: ${item.description}`,
    `${labels.category}: ${item.category || "-"}`,
    `${labels.tags}: ${tags}`,
    `${labels.protect}: ${item.protect ? labels.yes : labels.no}`,
    "",
    `${labels.content}:`,
    item.content,
  ];

  return lines.join("\n");
};

const serializeExperienceAsset = (
  item: ExperienceAsset,
  labels: ExperienceDiffLabels,
) => {
  const lines = [
    `${labels.title}: ${item.title}`,
    `${labels.protect}: ${item.protect ? labels.yes : labels.no}`,
    "",
    `${labels.content}:`,
    item.content,
  ];

  return lines.join("\n");
};

const buildDiffLines = (beforeText: string, afterText: string): DiffLine[] => {
  const segments = diffLines(beforeText, afterText);
  const lines: DiffLine[] = [];

  segments.forEach((segment) => {
    const type: DiffLineType = segment.added
      ? "add"
      : segment.removed
        ? "remove"
        : "same";

    segment.value.split("\n").forEach((line, index, allLines) => {
      const isTrailingEmpty = index === allLines.length - 1 && line === "";
      if (isTrailingEmpty) {
        return;
      }
      lines.push({ type, text: line });
    });
  });

  return lines;
};

const normalizeSuggestionValue = (value: string) => {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) {
    return "-";
  }
  return compact.length > 120 ? `${compact.slice(0, 120)}...` : compact;
};

const initialChangeProposals: ChangeProposal[] = (() => {
  const skillCandidate = initialSkills.find((item) => item.id === "skill-emergency-qa");
  if (!skillCandidate) {
    return [];
  }

  return [
    {
      id: "proposal-skill-emergency-qa",
      tab: "skills",
      targetId: skillCandidate.id,
      before: cloneStructuredAsset(skillCandidate),
      after: {
        ...cloneStructuredAsset(skillCandidate),
        description:
          "突发事件报告分诊模板，新增处置时效与跨部门升级规则，减少遗漏与延迟。",
        tags: ["模板", "研判", "事件流转", "时效"],
        content:
          "# 分诊框架\n\n- 事件类型\n- 风险等级\n- 通知对象\n- 建议动作\n- 升级阈值\n- 处置时效\n- 缺失信息",
      },
    },
  ];
})();

const initialGlossaryChangeProposals: GlossaryChangeProposal[] = (() => {
  const rainfallItem = initialGlossary.find(
    (item) => item.id === "glossary-rainfall-threshold",
  );
  if (!rainfallItem) {
    return [];
  }

  return [
    {
      id: "glossary-proposal-rainfall-threshold",
      targetId: rainfallItem.id,
      before: cloneGlossaryAsset(rainfallItem),
      after: {
        ...cloneGlossaryAsset(rainfallItem),
        aliases: [...rainfallItem.aliases, "预警雨量阈值"],
        content: "用于判定地质灾害预警等级与触发条件的关键雨强临界值。",
      },
      reason: "根据近期负反馈补全常见别名，并统一术语解释口径。",
    },
    {
      id: "glossary-proposal-new-duration-curve",
      targetId: "glossary-rainfall-duration-curve",
      before: null,
      after: {
        id: "glossary-rainfall-duration-curve",
        term: "雨量历时曲线",
        aliases: ["降雨历时曲线", "雨量-历时曲线"],
        source: "ai",
        content: "用于判断不同历时降雨过程与灾害触发概率关系的分析曲线。",
        protect: false,
      },
      reason: "AI 从近期对话中提炼的高频术语，建议纳入词表以提升召回。",
    },
    {
      id: "glossary-proposal-merge-rainfall-model",
      targetId: "glossary-rainfall-trigger-model",
      before: null,
      after: {
        id: "glossary-rainfall-trigger-model",
        term: "降雨触发阈值模型",
        aliases: ["雨强-历时触发模型", "降雨触发模型", "ID 触发模型"],
        source: "system",
        content:
          "合并雨强阈值与雨量历时曲线后的统一词条，用于灾害触发条件联合检索与研判。",
        protect: false,
      },
      reason: "发现两个词条在检索与生成中频繁共现，建议合并为统一口径词条。",
      mergeFrom: [
        cloneGlossaryAsset(rainfallItem),
        {
          id: "legacy-glossary-rainfall-duration-curve",
          term: "雨量历时曲线",
          aliases: ["降雨历时曲线", "雨量-历时曲线"],
          source: "system",
          content: "描述不同降雨历时与触发概率关系的分析曲线。",
          protect: false,
        },
      ],
    },
  ];
})();

const memoryTabOrder: MemoryTab[] = ["glossary", "skills", "experience", "tools"];

export default function MemoryManagement() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<MemoryTab>("skills");
  const [toolAssets] = useState<StructuredAsset[]>(initialTools);
  const [skillAssets, setSkillAssets] = useState<StructuredAsset[]>(initialSkills);
  const [experienceAssets, setExperienceAssets] =
    useState<ExperienceAsset[]>(initialExperience);
  const [experienceFeatureEnabled, setExperienceFeatureEnabled] = useState(true);
  const [glossaryAssets, setGlossaryAssets] =
    useState<GlossaryAsset[]>(initialGlossary);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>();
  const [tag, setTag] = useState<string>();
  const [glossarySource, setGlossarySource] = useState<GlossarySource>();
  const [glossaryInboxOpen, setGlossaryInboxOpen] = useState(false);
  const [selectedGlossaryProposalIds, setSelectedGlossaryProposalIds] = useState<string[]>(
    [],
  );
  const [glossaryDetailTarget, setGlossaryDetailTarget] =
    useState<GlossaryAsset | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>("view");
  const [draft, setDraft] = useState<AssetDraft>(createDraft());
  const [modalOpen, setModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [changeProposals, setChangeProposals] =
    useState<ChangeProposal[]>(initialChangeProposals);
  const [glossaryChangeProposals, setGlossaryChangeProposals] =
    useState<GlossaryChangeProposal[]>(initialGlossaryChangeProposals);
  const [activeProposalId, setActiveProposalId] = useState<string>();
  const [activeReviewStep, setActiveReviewStep] = useState<0 | 1>(0);
  const [proposalFieldDecisions, setProposalFieldDecisions] =
    useState<Record<string, ProposalFieldDecision>>({});
  const [selectedFieldKeys, setSelectedFieldKeys] = useState<ProposalFieldKey[]>([]);
  const [manualMergedDraft, setManualMergedDraft] =
    useState<StructuredAsset | ExperienceAsset | null>(null);
  const [isPreviewContentEditing, setIsPreviewContentEditing] = useState(false);
  const [manualPreviewContentDraft, setManualPreviewContentDraft] = useState("");
  const [qaQuestionDraft, setQaQuestionDraft] = useState("");
  const [shareDraft, setShareDraft] = useState<ShareRecord>({
    groupIds: [],
    userIds: [],
  });
  const [shareRecords, setShareRecords] = useState<Record<string, ShareRecord>>({});
  const [shareUsers, setShareUsers] = useState<UserItem[]>([]);
  const [shareGroups, setShareGroups] = useState<GroupItem[]>([]);
  const [shareLoading, setShareLoading] = useState(false);
  const handledShareKeyRef = useRef("");

  const tabMeta: Record<
    MemoryTab,
    { title: string; description: string; unit: string; icon: ReactNode }
  > = {
    tools: {
      title: t("admin.memoryTabTools"),
      description: t("admin.memoryTabToolsDesc"),
      unit: t("admin.memoryUnitTool"),
      icon: <ToolOutlined />,
    },
    skills: {
      title: t("admin.memoryTabSkills"),
      description: t("admin.memoryTabSkillsDesc"),
      unit: t("admin.memoryUnitSkill"),
      icon: <AppstoreOutlined />,
    },
    experience: {
      title: t("admin.memoryTabExperience"),
      description: t("admin.memoryTabExperienceDesc"),
      unit: t("admin.memoryUnitExperience"),
      icon: <HistoryOutlined />,
    },
    glossary: {
      title: t("admin.memoryTabGlossary"),
      description: t("admin.memoryTabGlossaryDesc"),
      unit: t("admin.memoryUnitGlossary"),
      icon: <BookOutlined />,
    },
  };

  const currentTabMeta = tabMeta[activeTab];
  const currentStructuredItems =
    activeTab === "tools"
      ? toolAssets
      : activeTab === "skills"
        ? skillAssets
        : [];

  const topLevelSkills = useMemo(
    () => skillAssets.filter((item) => !item.parentId),
    [skillAssets],
  );
  const parentSkillOptions = useMemo(
    () =>
      topLevelSkills
        .filter((item) => item.id !== draft.id)
        .map((item) => ({
          label: item.name,
          value: item.id,
        })),
    [draft.id, topLevelSkills],
  );

  const availableCategories = [...new Set(currentStructuredItems.map((item) => item.category))]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
  const availableTags = [
    ...new Set(currentStructuredItems.flatMap((item) => item.tags)),
  ].sort((left, right) => left.localeCompare(right));

  const shareableItems = useMemo(
    () => ({
      skills: skillAssets,
      experience: experienceAssets,
    }),
    [experienceAssets, skillAssets],
  );
  const proposalKey = useCallback(
    (tab: ChangeProposalTab, itemId: string) => `${tab}:${itemId}`,
    [],
  );
  const proposalMap = useMemo(() => {
    const map = new Map<string, ChangeProposal>();
    changeProposals.forEach((item) => {
      map.set(proposalKey(item.tab, item.targetId), item);
    });
    return map;
  }, [changeProposals, proposalKey]);
  const getPendingProposal = useCallback(
    (tab: ChangeProposalTab, itemId: string) => proposalMap.get(proposalKey(tab, itemId)),
    [proposalKey, proposalMap],
  );
  const activeProposal = useMemo(
    () =>
      activeProposalId
        ? changeProposals.find((item) => item.id === activeProposalId) || null
        : null,
    [activeProposalId, changeProposals],
  );
  const activeProposalFieldChanges = useMemo<ProposalFieldChange[]>(() => {
    if (!activeProposal) {
      return [];
    }

    const yesText = t("admin.memoryDiffBoolYes");
    const noText = t("admin.memoryDiffBoolNo");
    const toBoolText = (value: boolean) => (value ? yesText : noText);

    if (activeProposal.tab === "skills") {
      const beforeTags = activeProposal.before.tags.join(", ");
      const afterTags = activeProposal.after.tags.join(", ");

      return [
        activeProposal.before.name !== activeProposal.after.name
          ? {
              key: "name",
              label: t("admin.memoryName"),
              before: activeProposal.before.name,
              after: activeProposal.after.name,
            }
          : null,
        activeProposal.before.description !== activeProposal.after.description
          ? {
              key: "description",
              label: t("admin.memoryDescription"),
              before: activeProposal.before.description,
              after: activeProposal.after.description,
            }
          : null,
        activeProposal.before.category !== activeProposal.after.category
          ? {
              key: "category",
              label: t("admin.memoryCategory"),
              before: activeProposal.before.category,
              after: activeProposal.after.category,
            }
          : null,
        activeProposal.before.tags.join(",") !== activeProposal.after.tags.join(",")
          ? {
              key: "tags",
              label: t("admin.memoryTagSet"),
              before: beforeTags,
              after: afterTags,
            }
          : null,
        activeProposal.before.content !== activeProposal.after.content
          ? {
              key: "content",
              label: t("admin.memoryContent"),
              before: activeProposal.before.content,
              after: activeProposal.after.content,
            }
          : null,
        Boolean(activeProposal.before.protect) !== Boolean(activeProposal.after.protect)
          ? {
              key: "protect",
              label: t("admin.memoryProtect"),
              before: toBoolText(Boolean(activeProposal.before.protect)),
              after: toBoolText(Boolean(activeProposal.after.protect)),
            }
          : null,
      ].filter((item): item is ProposalFieldChange => Boolean(item));
    }

    return [
      activeProposal.before.title !== activeProposal.after.title
        ? {
            key: "title",
            label: t("admin.memoryTitle"),
            before: activeProposal.before.title,
            after: activeProposal.after.title,
          }
        : null,
      activeProposal.before.content !== activeProposal.after.content
        ? {
            key: "content",
            label: t("admin.memoryContent"),
            before: activeProposal.before.content,
            after: activeProposal.after.content,
          }
        : null,
      Boolean(activeProposal.before.protect) !== Boolean(activeProposal.after.protect)
        ? {
            key: "protect",
            label: t("admin.memoryProtect"),
            before: toBoolText(Boolean(activeProposal.before.protect)),
            after: toBoolText(Boolean(activeProposal.after.protect)),
          }
        : null,
    ].filter((item): item is ProposalFieldChange => Boolean(item));
  }, [activeProposal, t]);

  useEffect(() => {
    if (!activeProposal) {
      setProposalFieldDecisions({});
      setSelectedFieldKeys([]);
      setActiveReviewStep(0);
      setManualMergedDraft(null);
      setIsPreviewContentEditing(false);
      setManualPreviewContentDraft("");
      setQaQuestionDraft("");
      return;
    }

    const defaults = activeProposalFieldChanges.reduce<
      Record<string, ProposalFieldDecision>
    >((result, field) => {
      result[field.key] = "pending";
      return result;
    }, {});

    setProposalFieldDecisions(defaults);
    setSelectedFieldKeys([]);
    setActiveReviewStep(0);
    setManualMergedDraft(null);
    setIsPreviewContentEditing(false);
    setManualPreviewContentDraft("");
    setQaQuestionDraft("");
  }, [activeProposal, activeProposalFieldChanges]);

  const currentProposalFieldKeys = useMemo(
    () => activeProposalFieldChanges.map((field) => field.key),
    [activeProposalFieldChanges],
  );
  const allSelectableFieldsSelected = useMemo(
    () =>
      currentProposalFieldKeys.length > 0 &&
      selectedFieldKeys.length === currentProposalFieldKeys.length,
    [currentProposalFieldKeys, selectedFieldKeys],
  );
  const hasPartialFieldSelection = useMemo(
    () => selectedFieldKeys.length > 0 && !allSelectableFieldsSelected,
    [allSelectableFieldsSelected, selectedFieldKeys],
  );

  useEffect(() => {
    setSelectedFieldKeys((previous) =>
      previous.filter((key) => currentProposalFieldKeys.includes(key)),
    );
  }, [currentProposalFieldKeys]);

  const activeProposalMerged = useMemo<StructuredAsset | ExperienceAsset | null>(() => {
    if (!activeProposal) {
      return null;
    }

    const useAfterValue = (fieldKey: ProposalFieldKey) =>
      activeProposalFieldChanges.some((field) => field.key === fieldKey) &&
      (proposalFieldDecisions[fieldKey] ?? "pending") === "accept";

    if (activeProposal.tab === "skills") {
      const merged = cloneStructuredAsset(activeProposal.before);

      if (useAfterValue("name")) {
        merged.name = activeProposal.after.name;
      }
      if (useAfterValue("description")) {
        merged.description = activeProposal.after.description;
      }
      if (useAfterValue("category")) {
        merged.category = activeProposal.after.category;
      }
      if (useAfterValue("tags")) {
        merged.tags = [...activeProposal.after.tags];
      }
      if (useAfterValue("content")) {
        merged.content = activeProposal.after.content;
      }
      if (useAfterValue("protect")) {
        merged.protect = Boolean(activeProposal.after.protect);
      }

      return merged;
    }

    const merged = cloneExperienceAsset(activeProposal.before);
    if (useAfterValue("title")) {
      merged.title = activeProposal.after.title;
    }
    if (useAfterValue("content")) {
      merged.content = activeProposal.after.content;
    }
    if (useAfterValue("protect")) {
      merged.protect = Boolean(activeProposal.after.protect);
    }
    return merged;
  }, [activeProposal, activeProposalFieldChanges, proposalFieldDecisions]);

  const effectiveProposalMerged = useMemo<StructuredAsset | ExperienceAsset | null>(
    () => manualMergedDraft ?? activeProposalMerged,
    [activeProposalMerged, manualMergedDraft],
  );

  const hasEffectiveChange = useMemo(() => {
    if (!activeProposal || !effectiveProposalMerged) {
      return false;
    }

    if (activeProposal.tab === "skills") {
      const merged = effectiveProposalMerged as StructuredAsset;
      return (
        activeProposal.before.name !== merged.name ||
        activeProposal.before.description !== merged.description ||
        activeProposal.before.category !== merged.category ||
        activeProposal.before.tags.join(",") !== merged.tags.join(",") ||
        activeProposal.before.content !== merged.content ||
        Boolean(activeProposal.before.protect) !== Boolean(merged.protect)
      );
    }

    const merged = effectiveProposalMerged as ExperienceAsset;
    return (
      activeProposal.before.title !== merged.title ||
      activeProposal.before.content !== merged.content ||
      Boolean(activeProposal.before.protect) !== Boolean(merged.protect)
    );
  }, [activeProposal, effectiveProposalMerged]);

  const activeProposalDiff = useMemo(() => {
    if (!activeProposal || !effectiveProposalMerged) {
      return null;
    }

    const commonLabels = {
      protect: t("admin.memoryProtect"),
      content: t("admin.memoryContent"),
      yes: t("admin.memoryDiffBoolYes"),
      no: t("admin.memoryDiffBoolNo"),
    };
    const beforeText =
      activeProposal.tab === "skills"
        ? serializeStructuredAsset(activeProposal.before, {
            name: t("admin.memoryName"),
            description: t("admin.memoryDescription"),
            category: t("admin.memoryCategory"),
            tags: t("admin.memoryTagSet"),
            ...commonLabels,
          })
        : serializeExperienceAsset(activeProposal.before, {
            title: t("admin.memoryTitle"),
            ...commonLabels,
          });
    const afterText =
      activeProposal.tab === "skills"
        ? serializeStructuredAsset(effectiveProposalMerged as StructuredAsset, {
            name: t("admin.memoryName"),
            description: t("admin.memoryDescription"),
            category: t("admin.memoryCategory"),
            tags: t("admin.memoryTagSet"),
            ...commonLabels,
          })
        : serializeExperienceAsset(effectiveProposalMerged as ExperienceAsset, {
            title: t("admin.memoryTitle"),
            ...commonLabels,
          });

    const changedFields = activeProposalFieldChanges
      .filter((field) => (proposalFieldDecisions[field.key] ?? "pending") === "accept")
      .map((field) => field.label);

    return {
      beforeText,
      afterText,
      lines: buildDiffLines(beforeText, afterText),
      changedFields,
    };
  }, [
    activeProposal,
    activeProposalFieldChanges,
    effectiveProposalMerged,
    proposalFieldDecisions,
    t,
  ]);

  const acceptedFieldCount = useMemo(
    () =>
      activeProposalFieldChanges.filter(
        (field) => (proposalFieldDecisions[field.key] ?? "pending") === "accept",
      ).length,
    [activeProposalFieldChanges, proposalFieldDecisions],
  );
  const rejectedFieldCount = useMemo(
    () =>
      activeProposalFieldChanges.filter(
        (field) => (proposalFieldDecisions[field.key] ?? "pending") === "reject",
      ).length,
    [activeProposalFieldChanges, proposalFieldDecisions],
  );
  const pendingFieldCount = useMemo(
    () =>
      activeProposalFieldChanges.filter(
        (field) => (proposalFieldDecisions[field.key] ?? "pending") === "pending",
      ).length,
    [activeProposalFieldChanges, proposalFieldDecisions],
  );

  useEffect(() => {
    if (activeProposalId && !activeProposal) {
      setActiveProposalId(undefined);
    }
  }, [activeProposal, activeProposalId]);

  const keyword = query.trim().toLowerCase();
  const hasStructuredFilter = Boolean(keyword || category || tag);
  const matchesStructuredFilter = useCallback(
    (item: StructuredAsset) => {
      const matchesKeyword =
        !keyword ||
        item.name.toLowerCase().includes(keyword) ||
        item.description.toLowerCase().includes(keyword) ||
        item.content.toLowerCase().includes(keyword);
      const matchesCategory = !category || item.category === category;
      const matchesTag = !tag || item.tags.includes(tag);
      return matchesKeyword && matchesCategory && matchesTag;
    },
    [category, keyword, tag],
  );

  const filteredExperienceItems = experienceAssets;
  const filteredGlossaryItems = glossaryAssets.filter((item) => {
    const matchesSource = !glossarySource || item.source === glossarySource;
    if (!matchesSource) {
      return false;
    }

    if (!keyword) {
      return true;
    }

    return (
      item.term.toLowerCase().includes(keyword) ||
      item.aliases.some((alias) => alias.toLowerCase().includes(keyword)) ||
      item.content.toLowerCase().includes(keyword)
    );
  });
  const availableGlossarySourceOptions: Array<{
    value: GlossarySource;
    label: string;
  }> = [
    { value: "user", label: t("admin.memoryGlossarySourceUser") },
    { value: "ai", label: t("admin.memoryGlossarySourceAI") },
    { value: "system", label: t("admin.memoryGlossarySourceSystem") },
  ];

  const filteredStructuredItems = currentStructuredItems.filter((item) =>
    matchesStructuredFilter(item),
  );

  const filteredSkillTree = useMemo<SkillTreeNode[]>(() => {
    const skillMap = new Map(skillAssets.map((item) => [item.id, item]));
    const rootSkills = skillAssets.filter(
      (item) => !item.parentId || !skillMap.has(item.parentId),
    );
    const matchedIds = new Set(
      skillAssets.filter((item) => matchesStructuredFilter(item)).map((item) => item.id),
    );

    return rootSkills
      .map((parent): SkillTreeNode | null => {
        const childItems = skillAssets.filter((item) => item.parentId === parent.id);
        const parentMatched = matchedIds.has(parent.id);
        const visibleChildren = childItems.filter(
          (item) => !hasStructuredFilter || parentMatched || matchedIds.has(item.id),
        );
        const visibleParent =
          !hasStructuredFilter || parentMatched || visibleChildren.length > 0;

        if (!visibleParent) {
          return null;
        }

        return {
          ...parent,
          children: visibleChildren.length ? visibleChildren : undefined,
        };
      })
      .filter((item): item is SkillTreeNode => Boolean(item));
  }, [hasStructuredFilter, matchesStructuredFilter, skillAssets]);

  const protectedCount =
    skillAssets.filter((item) => item.protect).length +
    experienceAssets.filter((item) => item.protect).length +
    glossaryAssets.filter((item) => item.protect).length;
  const totalAssets =
    toolAssets.length + skillAssets.length + experienceAssets.length + glossaryAssets.length;
  const currentTabCount =
    activeTab === "experience"
      ? experienceAssets.length
      : activeTab === "glossary"
        ? glossaryAssets.length
        : currentStructuredItems.length;
  const glossarySourceCount = new Set(glossaryAssets.map((item) => item.source)).size;

  const summaryCards = [
    {
      key: "current",
      label: t("admin.memoryCurrentTabCount"),
      value: currentTabCount,
      icon: currentTabMeta.icon,
      tone: "primary",
    },
    {
      key: "total",
      label: t("admin.memoryTotalAssets"),
      value: totalAssets,
      icon: <AppstoreOutlined />,
      tone: "neutral",
    },
    {
      key: "protected",
      label: t("admin.memoryProtectedAssets"),
      value: protectedCount,
      icon: <SafetyCertificateOutlined />,
      tone: "highlight",
    },
    {
      key: "facet",
      label:
        activeTab === "experience"
          ? t("admin.memoryTagCount")
          : activeTab === "glossary"
            ? t("admin.memorySourceCount")
          : t("admin.memoryCategoryCount"),
      value:
        activeTab === "experience"
          ? availableTags.length
          : activeTab === "glossary"
            ? glossarySourceCount
            : availableCategories.length,
      icon: <LockOutlined />,
      tone: "soft",
    },
  ];

  const resetFilters = () => {
    setQuery("");
    setCategory(undefined);
    setTag(undefined);
    setGlossarySource(undefined);
  };

  const addChildSkillDraft = () => {
    setDraft((previous) => ({
      ...previous,
      childSkills: [...previous.childSkills, createChildSkillDraft()],
    }));
  };

  const updateChildSkillDraft = (
    tempId: string,
    patch: Partial<Omit<ChildSkillDraft, "tempId">>,
  ) => {
    setDraft((previous) => ({
      ...previous,
      childSkills: previous.childSkills.map((item) =>
        item.tempId === tempId ? { ...item, ...patch } : item,
      ),
    }));
  };

  const removeChildSkillDraft = (tempId: string) => {
    setDraft((previous) => ({
      ...previous,
      childSkills: previous.childSkills.filter((item) => item.tempId !== tempId),
    }));
  };

  const readFileAsText = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });

  const handleUploadSkillFile = async (file: File, childTempId?: string) => {
    if (!canUploadSkillFile(file.name)) {
      message.warning(t("admin.memoryUploadSkillTypeInvalid"));
      return;
    }

    try {
      const content = await readFileAsText(file);
      const inferredName = getBaseName(file.name);

      if (childTempId) {
        setDraft((previous) => ({
          ...previous,
          childSkills: previous.childSkills.map((item) =>
            item.tempId === childTempId
              ? {
                  ...item,
                  name: item.name || inferredName,
                  content,
                }
              : item,
          ),
        }));
      } else {
        setDraft((previous) => ({
          ...previous,
          name: previous.name || inferredName,
          content,
        }));
      }

      message.success(t("admin.memoryUploadSkillSuccess"));
    } catch (error) {
      console.error("Read skill file failed:", error);
      message.error(t("admin.memoryUploadSkillFailed"));
    }
  };

  const createSkillUploadProps = (childTempId?: string): UploadProps => ({
    accept: skillUploadAccept,
    maxCount: 1,
    showUploadList: false,
    beforeUpload: (file) => {
      void handleUploadSkillFile(file as File, childTempId);
      return Upload.LIST_IGNORE;
    },
  });

  const getShareKey = (tab: ShareableTab, itemId: string) => `${tab}:${itemId}`;

  const syncShareParams = (nextTab?: MemoryTab, nextItemId?: string) => {
    const nextSearchParams = new URLSearchParams(searchParams);

    if (nextTab && nextTab !== "tools") {
      nextSearchParams.set("tab", nextTab);
    } else {
      nextSearchParams.delete("tab");
    }

    if (nextItemId) {
      nextSearchParams.set("item", nextItemId);
    } else {
      nextSearchParams.delete("item");
    }

    setSearchParams(nextSearchParams, { replace: true });
  };

  const openModal = (
    mode: ModalMode,
    item?: StructuredAsset | ExperienceAsset | GlossaryAsset,
  ) => {
    if (mode === "add" && activeTab === "experience") {
      return;
    }

    setModalMode(mode);

    if (!item) {
      setDraft(createDraft());
      setModalOpen(true);
      return;
    }

    if ("title" in item) {
      setDraft({
        id: item.id,
        title: item.title,
        name: "",
        description: "",
        category: "",
        tags: [],
        parentId: "",
        childSkills: [],
        term: "",
        aliases: [],
        source: "user",
        content: item.content,
        protect: Boolean(item.protect),
      });
    } else if ("term" in item) {
      setDraft({
        id: item.id,
        title: "",
        name: "",
        description: "",
        category: "",
        tags: [],
        parentId: "",
        childSkills: [],
        term: item.term,
        aliases: [...item.aliases],
        source: item.source,
        content: item.content,
        protect: Boolean(item.protect),
      });
    } else {
      setDraft({
        id: item.id,
        title: "",
        name: item.name,
        description: item.description,
        category: item.category,
        tags: item.tags,
        parentId: item.parentId || "",
        childSkills: [],
        term: "",
        aliases: [],
        source: "user",
        content: item.content,
        protect: Boolean(item.protect),
      });
    }

    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    syncShareParams(activeTab);
  };

  const openShareModal = (tab: ShareableTab, item: StructuredAsset | ExperienceAsset) => {
    const existingShare = shareRecords[getShareKey(tab, item.id)] || {
      groupIds: [],
      userIds: [],
    };

    setShareTarget({ tab, item });
    setShareDraft(existingShare);
    setShareModalOpen(true);
  };

  const closeShareModal = () => {
    setShareModalOpen(false);
    setShareTarget(null);
    setShareDraft({ groupIds: [], userIds: [] });
  };

  const openChangeReview = (tab: ChangeProposalTab, itemId: string) => {
    const proposal = getPendingProposal(tab, itemId);
    if (!proposal) {
      message.info(t("admin.memoryDiffNoPending"));
      return;
    }

    const itemExists =
      tab === "skills"
        ? skillAssets.some((item) => item.id === itemId)
        : experienceAssets.some((item) => item.id === itemId);

    if (!itemExists) {
      setChangeProposals((previous) =>
        previous.filter((item) => item.id !== proposal.id),
      );
      message.warning(t("admin.memoryDiffTargetMissing"));
      return;
    }

    setActiveProposalId(proposal.id);
  };

  const setFieldDecision = (
    fieldKey: ProposalFieldKey,
    decision: ProposalFieldDecision,
  ) => {
    setProposalFieldDecisions((previous) => ({ ...previous, [fieldKey]: decision }));
  };
  const setFieldSelected = (fieldKey: ProposalFieldKey, checked: boolean) => {
    setSelectedFieldKeys((previous) => {
      if (checked) {
        return previous.includes(fieldKey) ? previous : [...previous, fieldKey];
      }
      return previous.filter((key) => key !== fieldKey);
    });
  };
  const setAllFieldsSelected = (checked: boolean) => {
    setSelectedFieldKeys(checked ? [...currentProposalFieldKeys] : []);
  };
  const setAllFieldDecision = (decision: ProposalFieldDecision): boolean => {
    if (!selectedFieldKeys.length) {
      message.info(t("admin.memoryDiffSelectFieldFirst"));
      return false;
    }

    setProposalFieldDecisions((previous) => {
      const next = { ...previous };
      selectedFieldKeys.forEach((fieldKey) => {
        next[fieldKey] = decision;
      });
      return next;
    });
    return true;
  };
  const handleBatchAcceptAndGoPreview = () => {
    if (setAllFieldDecision("accept")) {
      goToReviewPreview();
    }
  };
  const handleBatchRejectWithConfirm = () => {
    if (!selectedFieldKeys.length) {
      message.info(t("admin.memoryDiffSelectFieldFirst"));
      return;
    }

    Modal.confirm({
      title: t("admin.memoryDiffBatchRejectConfirmTitle"),
      content: t("admin.memoryDiffBatchRejectConfirmContent"),
      okText: t("admin.memoryDiffBatchRejectConfirmOk"),
      cancelText: t("common.cancel"),
      okButtonProps: { danger: true },
      onOk: () => {
        setAllFieldDecision("reject");
      },
    });
  };
  const clearSelectedFields = () => {
    if (!selectedFieldKeys.length) {
      message.info(t("admin.memoryDiffSelectFieldFirst"));
      return;
    }
    setSelectedFieldKeys([]);
  };

  const sendReviewQuestion = () => {
    const text = qaQuestionDraft.trim();
    if (!text) {
      return;
    }

    message.success(t("admin.memoryDiffQaSendSuccess"));
    setQaQuestionDraft("");
  };

  const handleReviewQuestionKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendReviewQuestion();
    }
  };

  const goToReviewPreview = () => {
    setActiveReviewStep(1);
  };

  const goToReviewChoose = () => {
    setIsPreviewContentEditing(false);
    setActiveReviewStep(0);
  };

  const finishCloseChangeReview = () => {
    setIsPreviewContentEditing(false);
    setActiveProposalId(undefined);
  };
  const closeChangeReview = () => {
    if (activeReviewStep !== 1) {
      finishCloseChangeReview();
      return;
    }

    Modal.confirm({
      title: t("admin.memoryDiffClosePreviewConfirmTitle"),
      content: t("admin.memoryDiffClosePreviewConfirmContent"),
      okText: t("admin.memoryDiffClosePreviewConfirmOk"),
      cancelText: t("common.cancel"),
      onOk: finishCloseChangeReview,
    });
  };

  const startPreviewContentEdit = () => {
    if (!activeProposal || !effectiveProposalMerged || !activeProposalMerged) {
      return;
    }

    const currentContent =
      activeProposal.tab === "skills"
        ? (manualMergedDraft as StructuredAsset | null)?.content ??
          (activeProposalMerged as StructuredAsset).content
        : (manualMergedDraft as ExperienceAsset | null)?.content ??
          (activeProposalMerged as ExperienceAsset).content;

    setManualPreviewContentDraft(currentContent);
    setIsPreviewContentEditing(true);
  };

  const savePreviewContentEdit = () => {
    if (!activeProposal || !effectiveProposalMerged) {
      return;
    }

    if (activeProposal.tab === "skills") {
      const nextMerged = cloneStructuredAsset(effectiveProposalMerged as StructuredAsset);
      nextMerged.content = manualPreviewContentDraft;
      setManualMergedDraft(nextMerged);
    } else {
      const nextMerged = cloneExperienceAsset(effectiveProposalMerged as ExperienceAsset);
      nextMerged.content = manualPreviewContentDraft;
      setManualMergedDraft(nextMerged);
    }

    setIsPreviewContentEditing(false);
    message.success(t("admin.memoryDiffManualSaveSuccess"));
  };

  const approveChangeProposal = () => {
    if (!activeProposal || !effectiveProposalMerged) {
      return;
    }

    if (!hasEffectiveChange) {
      setChangeProposals((previous) =>
        previous.filter((item) => item.id !== activeProposal.id),
      );
      setActiveProposalId(undefined);
      message.success(t("admin.memoryDiffKeepOriginalSuccess"));
      return;
    }

    if (activeProposal.tab === "skills") {
      const itemExists = skillAssets.some((item) => item.id === activeProposal.targetId);
      if (!itemExists) {
        setChangeProposals((previous) =>
          previous.filter((item) => item.id !== activeProposal.id),
        );
        setActiveProposalId(undefined);
        message.warning(t("admin.memoryDiffTargetMissing"));
        return;
      }

      setSkillAssets((previous) =>
        previous.map((item) =>
          item.id === activeProposal.targetId
            ? cloneStructuredAsset(effectiveProposalMerged as StructuredAsset)
            : item,
        ),
      );
    } else {
      const itemExists = experienceAssets.some((item) => item.id === activeProposal.targetId);
      if (!itemExists) {
        setChangeProposals((previous) =>
          previous.filter((item) => item.id !== activeProposal.id),
        );
        setActiveProposalId(undefined);
        message.warning(t("admin.memoryDiffTargetMissing"));
        return;
      }

      setExperienceAssets((previous) =>
        previous.map((item) =>
          item.id === activeProposal.targetId
            ? cloneExperienceAsset(effectiveProposalMerged as ExperienceAsset)
            : item,
        ),
      );
    }

    setChangeProposals((previous) =>
      previous.filter((item) => item.id !== activeProposal.id),
    );
    setActiveProposalId(undefined);
    message.success(t("admin.memoryDiffApproveSuccess"));
  };

  const handleDelete = (item: StructuredAsset | ExperienceAsset | GlossaryAsset) => {
    const itemName = "title" in item ? item.title : "term" in item ? item.term : item.name;

    Modal.confirm({
      title: t("common.delete"),
      content: t("admin.memoryDeleteConfirm", { name: itemName }),
      okText: t("common.confirm"),
      cancelText: t("common.cancel"),
      okButtonProps: { danger: true },
      onOk: () => {
        if (activeTab === "skills") {
          setSkillAssets((previous) =>
            previous.filter((entry) => entry.id !== item.id && entry.parentId !== item.id),
          );
          setChangeProposals((previous) =>
            previous.filter(
              (proposal) =>
                !(proposal.tab === "skills" && proposal.targetId === item.id),
            ),
          );
        }

        if (activeTab === "experience") {
          setExperienceAssets((previous) =>
            previous.filter((entry) => entry.id !== item.id),
          );
          setChangeProposals((previous) =>
            previous.filter(
              (proposal) =>
                !(proposal.tab === "experience" && proposal.targetId === item.id),
            ),
          );
        }
        if (activeTab === "glossary") {
          setGlossaryAssets((previous) =>
            previous.filter((entry) => entry.id !== item.id),
          );
          setGlossaryChangeProposals((previous) =>
            previous.filter((proposal) => proposal.targetId !== item.id),
          );
        }

        message.success(t("admin.memoryDeleteSuccess"));
      },
    });
  };

  const saveDraft = () => {
    if (activeTab === "glossary") {
      if (!draft.term.trim() || !draft.content.trim()) {
        message.warning(`${t("common.pleaseInput")}${t("admin.memoryGlossaryTerm")}`);
        return;
      }

      const payload: GlossaryAsset = {
        id: draft.id || createId("glossary"),
        term: draft.term.trim(),
        aliases: draft.aliases.map((item) => item.trim()).filter(Boolean),
        source: draft.source,
        content: draft.content.trim(),
        protect: draft.protect,
      };

      setGlossaryAssets((previous) => {
        if (modalMode === "edit") {
          return previous.map((item) => (item.id === payload.id ? payload : item));
        }
        return [payload, ...previous];
      });
      if (modalMode === "edit") {
        setGlossaryChangeProposals((previous) =>
          previous.filter((proposal) => proposal.targetId !== payload.id),
        );
      }
    } else if (activeTab === "experience") {
      if (!draft.title.trim() || !draft.content.trim()) {
        message.warning(`${t("common.pleaseInput")}${t("admin.memoryTitle")}`);
        return;
      }

      const payload: ExperienceAsset = {
        id: draft.id || createId("exp"),
        title: draft.title.trim(),
        content: draft.content.trim(),
        protect: draft.protect,
      };

      setExperienceAssets((previous) => {
        if (modalMode === "edit") {
          return previous.map((item) => (item.id === payload.id ? payload : item));
        }

        return [payload, ...previous];
      });
      if (modalMode === "edit") {
        setChangeProposals((previous) =>
          previous.filter(
            (item) => !(item.tab === "experience" && item.targetId === payload.id),
          ),
        );
      }
    } else {
      const isChildSkill = activeTab === "skills" && Boolean(draft.parentId);
      if (
        !draft.name.trim() ||
        !draft.content.trim() ||
        (!isChildSkill && !draft.description.trim())
      ) {
        message.warning(`${t("common.pleaseInput")}${t("admin.memoryName")}`);
        return;
      }

      const payload: StructuredAsset = {
        id: draft.id || createId(activeTab === "tools" ? "tool" : "skill"),
        name: draft.name.trim(),
        description: isChildSkill ? "" : draft.description.trim(),
        category: isChildSkill ? "" : draft.category.trim(),
        tags: isChildSkill ? [] : draft.tags,
        parentId: activeTab === "skills" ? draft.parentId || undefined : undefined,
        content: draft.content.trim(),
        protect: draft.protect,
      };

      if (activeTab === "skills") {
        const parentSkill = payload.parentId
          ? skillAssets.find((item) => item.id === payload.parentId)
          : undefined;
        if (payload.parentId && payload.parentId === payload.id) {
          message.warning(t("admin.memoryParentSkillSelf"));
          return;
        }

        if (parentSkill?.parentId) {
          message.warning(t("admin.memoryParentSkillSecondLevelOnly"));
          return;
        }

        const hasChildren = skillAssets.some((item) => item.parentId === payload.id);
        if (payload.parentId && hasChildren) {
          message.warning(t("admin.memoryParentSkillHasChildren"));
          return;
        }

        if (payload.parentId && parentSkill) {
          payload.protect = Boolean(parentSkill.protect);
        }

        const canCreateChildSkills =
          modalMode === "add" && !payload.parentId && draft.childSkills.length > 0;
        let childPayloads: StructuredAsset[] = [];
        if (canCreateChildSkills) {
          const hasInvalidChild = draft.childSkills.some(
            (child) => !child.name.trim() || !child.content.trim(),
          );
          if (hasInvalidChild) {
            message.warning(t("admin.memoryChildSkillRequired"));
            return;
          }

          childPayloads = draft.childSkills.map((child) => ({
            id: createId("skill"),
            name: child.name.trim(),
            description: "",
            category: "",
            tags: [],
            content: child.content.trim(),
            protect: payload.protect,
            parentId: payload.id,
          }));
        }

        setSkillAssets((previous) => {
          if (modalMode === "edit") {
            return previous.map((item) => (item.id === payload.id ? payload : item));
          }

          return [payload, ...childPayloads, ...previous];
        });
        if (modalMode === "edit") {
          setChangeProposals((previous) =>
            previous.filter(
              (item) => !(item.tab === "skills" && item.targetId === payload.id),
            ),
          );
        }
      }
    }

    setModalOpen(false);
    message.success(t("admin.memorySaveSuccess"));
  };

  const handleCopyShareLink = async (
    tab: ShareableTab,
    item: StructuredAsset | ExperienceAsset,
  ) => {
    const shareUrl = new URL(
      `${window.location.origin}${window.BASENAME || ""}/admin/memory-management`,
    );

    shareUrl.searchParams.set("tab", tab);
    shareUrl.searchParams.set("item", item.id);

    try {
      await navigator.clipboard.writeText(shareUrl.toString());
      message.success(t("admin.memoryShareCopied"));
    } catch (error) {
      console.error("Copy share link failed:", error);
      message.error(t("admin.memoryShareCopyFailed"));
    }
  };

  const handleConfirmShare = async () => {
    if (!shareTarget) {
      return;
    }

    if (!shareDraft.groupIds.length && !shareDraft.userIds.length) {
      message.warning(t("admin.memoryShareRequireRecipient"));
      return;
    }

    setShareRecords((previous) => ({
      ...previous,
      [getShareKey(shareTarget.tab, shareTarget.item.id)]: {
        groupIds: shareDraft.groupIds,
        userIds: shareDraft.userIds,
      },
    }));

    message.success(t("admin.memoryShareSuccess"));
    closeShareModal();
  };

  useEffect(() => {
    if (!shareModalOpen) {
      return;
    }

    const fetchShareOptions = async () => {
      setShareLoading(true);

      try {
        const [userResponse, groupResponse] = await Promise.all([
          createUserApi().listUsersApiAuthserviceUserGet({
            page: 1,
            pageSize: 200,
          }),
          createGroupApi().listGroupsApiAuthserviceGroupGet({
            page: 1,
            pageSize: 200,
          }),
        ]);

        const userPayload = (userResponse.data as any)?.data || userResponse.data || {};
        const groupPayload = (groupResponse.data as any)?.data || groupResponse.data || {};

        setShareUsers(Array.isArray(userPayload.users) ? userPayload.users : []);
        setShareGroups(Array.isArray(groupPayload.groups) ? groupPayload.groups : []);
      } catch (error) {
        console.error("Fetch share targets failed:", error);
        message.error(t("admin.memoryShareLoadFailed"));
      } finally {
        setShareLoading(false);
      }
    };

    fetchShareOptions();
  }, [shareModalOpen, t]);

  useEffect(() => {
    const sharedTab = searchParams.get("tab");
    const sharedItemId = searchParams.get("item");

    if (!sharedTab || !sharedItemId) {
      handledShareKeyRef.current = "";
      return;
    }

    if (sharedTab !== "skills" && sharedTab !== "experience") {
      return;
    }

    const shareKey = `${sharedTab}:${sharedItemId}`;
    if (handledShareKeyRef.current === shareKey) {
      return;
    }

    const matchedItem = shareableItems[sharedTab].find((item) => item.id === sharedItemId);
    if (!matchedItem) {
      message.warning(t("admin.memoryShareTargetMissing"));
      handledShareKeyRef.current = shareKey;
      return;
    }

    handledShareKeyRef.current = shareKey;
    setActiveTab(sharedTab);
    openModal("view", matchedItem);
  }, [searchParams, shareableItems, t]);
  const glossarySourceLabelMap: Record<GlossarySource, string> = {
    user: t("admin.memoryGlossarySourceUser"),
    ai: t("admin.memoryGlossarySourceAI"),
    system: t("admin.memoryGlossarySourceSystem"),
  };
  const glossarySourceColorMap: Record<GlossarySource, string> = {
    user: "blue",
    ai: "purple",
    system: "gold",
  };
  const glossaryProposalIds = useMemo(
    () => glossaryChangeProposals.map((item) => item.id),
    [glossaryChangeProposals],
  );
  const isAllGlossaryProposalsSelected = useMemo(
    () =>
      glossaryProposalIds.length > 0 &&
      selectedGlossaryProposalIds.length === glossaryProposalIds.length,
    [glossaryProposalIds, selectedGlossaryProposalIds],
  );
  const isPartialGlossaryProposalSelected = useMemo(
    () =>
      selectedGlossaryProposalIds.length > 0 &&
      selectedGlossaryProposalIds.length < glossaryProposalIds.length,
    [glossaryProposalIds.length, selectedGlossaryProposalIds.length],
  );

  useEffect(() => {
    setSelectedGlossaryProposalIds((previous) =>
      previous.filter((id) => glossaryProposalIds.includes(id)),
    );
  }, [glossaryProposalIds]);

  const openGlossaryDetail = (item: GlossaryAsset) => {
    setGlossaryDetailTarget(cloneGlossaryAsset(item));
    setActiveTab("glossary");
  };
  const closeGlossaryDetail = () => {
    setGlossaryDetailTarget(null);
  };
  const applyGlossaryProposals = (proposals: GlossaryChangeProposal[]) => {
    if (!proposals.length) {
      message.info(t("admin.memoryGlossaryInboxSelectFirst"));
      return;
    }

    setGlossaryAssets((previous) => {
      const next = [...previous];
      proposals.forEach((proposal) => {
        const mergeSourceIds = proposal.mergeFrom?.map((item) => item.id) ?? [];
        if (mergeSourceIds.length) {
          for (let index = next.length - 1; index >= 0; index -= 1) {
            if (mergeSourceIds.includes(next[index].id)) {
              next.splice(index, 1);
            }
          }
        }

        const existingIndex = next.findIndex(
          (item) =>
            item.id === proposal.targetId ||
            (proposal.before ? item.id === proposal.before.id : false),
        );
        if (existingIndex >= 0) {
          next[existingIndex] = cloneGlossaryAsset(proposal.after);
          return;
        }
        next.unshift(cloneGlossaryAsset(proposal.after));
      });
      return next;
    });

    setGlossaryChangeProposals((previous) =>
      previous.filter(
        (proposal) => !proposals.some((selected) => selected.id === proposal.id),
      ),
    );
    setSelectedGlossaryProposalIds((previous) =>
      previous.filter((id) => !proposals.some((proposal) => proposal.id === id)),
    );
    message.success(t("admin.memoryGlossaryInboxAcceptSuccess"));
  };
  const rejectGlossaryProposals = (proposals: GlossaryChangeProposal[]) => {
    if (!proposals.length) {
      message.info(t("admin.memoryGlossaryInboxSelectFirst"));
      return;
    }

    setGlossaryChangeProposals((previous) =>
      previous.filter(
        (proposal) => !proposals.some((selected) => selected.id === proposal.id),
      ),
    );
    setSelectedGlossaryProposalIds((previous) =>
      previous.filter((id) => !proposals.some((proposal) => proposal.id === id)),
    );
    message.success(t("admin.memoryGlossaryInboxRejectSuccess"));
  };
  const acceptSelectedGlossaryProposals = () => {
    const selected = glossaryChangeProposals.filter((proposal) =>
      selectedGlossaryProposalIds.includes(proposal.id),
    );
    applyGlossaryProposals(selected);
  };
  const rejectSelectedGlossaryProposals = () => {
    const selected = glossaryChangeProposals.filter((proposal) =>
      selectedGlossaryProposalIds.includes(proposal.id),
    );
    rejectGlossaryProposals(selected);
  };

  const genericColumns: ColumnsType<StructuredAsset> = [
    {
      title: t("admin.memoryNameDesc"),
      dataIndex: "name",
      key: "name",
      width: 380,
      render: (_value, record) => {
        const pendingProposal =
          activeTab === "skills" ? getPendingProposal("skills", record.id) : undefined;

        return (
          <div className="memory-table-main">
            <div className="memory-table-main-title">
              <span>{record.name}</span>
              {pendingProposal ? (
                <Tag color="orange">{t("admin.memoryDiffPendingTag")}</Tag>
              ) : null}
              {record.protect ? (
                <Tag className="memory-protect-tag" bordered={false}>
                  <LockOutlined />
                  <span>{t("admin.memoryProtect")}</span>
                </Tag>
              ) : null}
            </div>
            {!record.parentId ? (
              <div className="memory-table-main-desc">{record.description}</div>
            ) : null}
          </div>
        );
      },
    },
    {
      title: t("admin.memoryCategory"),
      dataIndex: "category",
      key: "category",
      width: 180,
      render: (value: string, record) =>
        !record.parentId && value ? (
          <Tag className="memory-category-tag" bordered={false}>
            {value}
          </Tag>
        ) : (
          "-"
        ),
    },
    {
      title: t("admin.memoryTagSet"),
      dataIndex: "tags",
      key: "tags",
      width: 260,
      render: (tags: string[], record) =>
        !record.parentId && tags.length ? (
          <div className="memory-tag-group">
            {tags.map((item) => (
              <Tag key={item}>{item}</Tag>
            ))}
          </div>
        ) : (
          "-"
        ),
    },
    {
      title: t("admin.memoryOperations"),
      key: "actions",
      width: 250,
      fixed: "right",
      render: (_value, record) => {
        const pendingProposal =
          activeTab === "skills" ? getPendingProposal("skills", record.id) : undefined;

        return (
          <Space size={4}>
            <Tooltip title={t("admin.memoryViewItem")}>
              <Button
                type="text"
                icon={<EyeOutlined />}
                onClick={() => openModal("view", record)}
              />
            </Tooltip>
            {activeTab !== "tools" ? (
              <>
                <Tooltip
                  title={
                    pendingProposal
                      ? t("admin.memoryDiffReviewAction")
                      : t("admin.memoryDiffNoPending")
                  }
                >
                  <Button
                    type="text"
                    icon={<HistoryOutlined />}
                    disabled={!pendingProposal}
                    onClick={() => openChangeReview("skills", record.id)}
                  />
                </Tooltip>
                <Tooltip title={t("admin.memoryEditItem")}>
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => openModal("edit", record)}
                  />
                </Tooltip>
                {!record.parentId ? (
                  <Tooltip title={t("admin.memoryShareItem")}>
                    <Button
                      type="text"
                      icon={<LinkOutlined />}
                      onClick={() => openShareModal("skills", record)}
                    />
                  </Tooltip>
                ) : null}
                <Tooltip title={t("admin.memoryDeleteItem")}>
                  <Button
                    type="text"
                    danger
                    disabled={record.protect}
                    icon={<DeleteOutlined />}
                    onClick={() => handleDelete(record)}
                  />
                </Tooltip>
              </>
            ) : null}
          </Space>
        );
      },
    },
  ];

  const experienceColumns: ColumnsType<ExperienceAsset> = [
    {
      title: t("admin.memoryTitleCol"),
      dataIndex: "title",
      key: "title",
      width: 320,
      render: (_value, record) => (
        <div className="memory-table-main">
          <div className="memory-table-main-title">
            <span>{record.title}</span>
            {record.protect ? (
              <Tag className="memory-protect-tag" bordered={false}>
                <LockOutlined />
                <span>{t("admin.memoryProtect")}</span>
              </Tag>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      title: t("admin.memoryContentSummary"),
      dataIndex: "content",
      key: "content",
      render: (value: string) => (
        <div className="memory-content-preview">{value}</div>
      ),
    },
    {
      title: t("admin.memoryOperations"),
      key: "actions",
      width: 250,
      render: (_value, record) => (
        <Space size={4}>
          <Tooltip title={t("admin.memoryViewItem")}>
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => openModal("view", record)}
            />
          </Tooltip>
          <Tooltip title={t("admin.memoryEditItem")}>
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => openModal("edit", record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];
  const glossaryColumns: ColumnsType<GlossaryAsset> = [
    {
      title: t("admin.memoryGlossaryTerm"),
      dataIndex: "term",
      key: "term",
      width: 380,
      render: (_value, record) => (
        <div className="memory-table-main">
          <div className="memory-table-main-title">
            <button
              type="button"
              className="memory-term-link"
              onClick={() => openGlossaryDetail(record)}
            >
              {record.term}
            </button>
            {record.protect ? (
              <Tag className="memory-protect-tag" bordered={false}>
                <LockOutlined />
                <span>{t("admin.memoryProtect")}</span>
              </Tag>
            ) : null}
          </div>
          <div className="memory-tag-group memory-tag-group-scroll">
            {record.aliases.length ? (
              record.aliases.map((alias) => <Tag key={alias}>{alias}</Tag>)
            ) : (
              <span className="memory-content-preview">-</span>
            )}
          </div>
        </div>
      ),
    },
    {
      title: t("admin.memoryGlossarySource"),
      dataIndex: "source",
      key: "source",
      width: 150,
      render: (source: GlossarySource) => (
        <Tag color={glossarySourceColorMap[source]}>
          {glossarySourceLabelMap[source]}
        </Tag>
      ),
    },
    {
      title: t("admin.memoryContentSummary"),
      dataIndex: "content",
      key: "content",
      width: 420,
      render: (value: string) => (
        <div className="memory-content-preview memory-content-preview-glossary">
          {value}
        </div>
      ),
    },
    {
      title: t("admin.memoryOperations"),
      key: "actions",
      width: 170,
      render: (_value, record) => (
        <Space size={4}>
          <Tooltip title={t("admin.memoryViewItem")}>
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => openGlossaryDetail(record)}
            />
          </Tooltip>
          <Tooltip title={t("admin.memoryEditItem")}>
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => openModal("edit", record)}
            />
          </Tooltip>
          <Tooltip title={t("admin.memoryDeleteItem")}>
            <Button
              type="text"
              danger
              disabled={record.protect}
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const modalTitle = `${t(
    modalMode === "add"
      ? "admin.memoryModalCreate"
      : modalMode === "edit"
        ? "admin.memoryModalEdit"
        : "admin.memoryModalView",
  )}${currentTabMeta.unit}`;
  const isReadOnly = modalMode === "view" || activeTab === "tools";
  const isChildSkillDraft = activeTab === "skills" && Boolean(draft.parentId);
  const tagOptions = [...new Set([...availableTags, ...draft.tags])].map((item) => ({
    label: item,
    value: item,
  }));
  const isReviewMode = Boolean(activeProposal && activeProposalDiff);
  const glossaryDetailExists = useMemo(
    () =>
      glossaryDetailTarget
        ? glossaryAssets.some((item) => item.id === glossaryDetailTarget.id)
        : false,
    [glossaryAssets, glossaryDetailTarget],
  );
  const isGlossaryDetailMode = activeTab === "glossary" && Boolean(glossaryDetailTarget);

  return (
    <div className="admin-page memory-page">
      {isReviewMode && activeProposal && activeProposalDiff ? (
        <div
          className={`memory-review-page ${
            activeReviewStep === 0 ? "is-step-choose" : "is-step-preview"
          }`}
        >
          <div className="memory-review-workspace">
            <div className="memory-review-header">
              <div className="memory-review-title">
                <h3>{t("admin.memoryDiffDialogTitle")}</h3>
                <Steps
                  current={activeReviewStep}
                  className="memory-review-steps"
                  onChange={(nextStep) => {
                    if (nextStep === 0) {
                      goToReviewChoose();
                      return;
                    }
                    goToReviewPreview();
                  }}
                  items={[
                    { title: t("admin.memoryDiffStepChooseTitle") },
                    { title: t("admin.memoryDiffStepPreviewTitle") },
                  ]}
                />
              </div>
              <Space wrap>
                <Button onClick={closeChangeReview}>{t("common.close")}</Button>
                {activeReviewStep === 1 ? (
                  <Button onClick={goToReviewChoose}>{t("admin.memoryDiffStepPrev")}</Button>
                ) : null}
                {activeReviewStep === 1 ? (
                  <Button type="primary" onClick={approveChangeProposal}>
                    {hasEffectiveChange
                      ? t("admin.memoryDiffApprove")
                      : t("admin.memoryDiffKeepOriginal")}
                  </Button>
                ) : null}
              </Space>
            </div>
            <Alert
              type="info"
              showIcon
              message={
                activeReviewStep === 0
                  ? t("admin.memoryDiffStepChooseHint")
                  : t("admin.memoryDiffStepPreviewHint")
              }
            />
            {activeReviewStep === 0 ? (
              <div className="memory-review-grid memory-review-grid-step-choose">
                <div className="memory-review-column">
                  <div className="memory-diff-raw-card">
                    <h4>{t("admin.memoryDiffBefore")}</h4>
                    <div className="memory-diff-source-lines">
                      {activeProposalDiff.beforeText.split("\n").map((line, index) => (
                        <div key={`source-${index}`} className="memory-diff-source-line">
                          {line || " "}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="memory-review-column">
                  <div className="memory-diff-change-toolbar">
                    <div className="memory-diff-change-toolbar-left">
                      <Checkbox
                        checked={allSelectableFieldsSelected}
                        indeterminate={hasPartialFieldSelection}
                        onChange={(event) => setAllFieldsSelected(event.target.checked)}
                      >
                        {t("admin.memoryDiffSelectAll")}
                      </Checkbox>
                      <span>
                        {t("admin.memoryDiffDecisionStats", {
                          accepted: acceptedFieldCount,
                          rejected: rejectedFieldCount,
                          pending: pendingFieldCount,
                        })}
                      </span>
                    </div>
                    <Space size={6} wrap>
                      <Button
                        size="small"
                        onClick={handleBatchAcceptAndGoPreview}
                      >
                        {t("admin.memoryDiffBatchAcceptAll")}
                      </Button>
                      <Button
                        size="small"
                        onClick={handleBatchRejectWithConfirm}
                      >
                        {t("admin.memoryDiffBatchRejectAll")}
                      </Button>
                      <Button size="small" onClick={clearSelectedFields}>
                        {t("admin.memoryDiffBatchClear")}
                      </Button>
                    </Space>
                  </div>
                  <div className="memory-diff-change-list">
                    {activeProposalFieldChanges.length ? (
                      activeProposalFieldChanges.map((field, index) => {
                        const decision = proposalFieldDecisions[field.key] ?? "pending";
                        const isAccepted = decision === "accept";
                        const isRejected = decision === "reject";
                        const suggestionText = t("admin.memoryDiffSuggestionTemplate", {
                          field: field.label,
                          value: normalizeSuggestionValue(field.after),
                        });

                        return (
                          <div className="memory-diff-change-item" key={field.key}>
                            <div className="memory-diff-change-item-head">
                              <div className="memory-diff-change-item-title">
                                <div className="memory-diff-change-item-check">
                                  <Checkbox
                                    checked={selectedFieldKeys.includes(field.key)}
                                    onChange={(event) =>
                                      setFieldSelected(field.key, event.target.checked)
                                    }
                                  >
                                    {`${index + 1}. ${field.label}`}
                                  </Checkbox>
                                </div>
                                {decision !== "pending" ? (
                                  <span
                                    className={`memory-diff-change-decision is-${decision}`}
                                  >
                                    {decision === "accept"
                                      ? t("admin.memoryDiffFieldAccepted")
                                      : t("admin.memoryDiffFieldRejected")}
                                  </span>
                                ) : null}
                              </div>
                              <div className="memory-diff-change-actions">
                                <Button
                                  size="small"
                                  type={isAccepted ? "primary" : "default"}
                                  onClick={() => {
                                    setFieldDecision(field.key, "accept");
                                    goToReviewPreview();
                                  }}
                                >
                                  {t("admin.memoryDiffAcceptField")}
                                </Button>
                                <Popconfirm
                                  title={t("admin.memoryDiffRejectFieldConfirmTitle")}
                                  description={t("admin.memoryDiffRejectFieldConfirmContent")}
                                  okText={t("admin.memoryDiffRejectFieldConfirmOk")}
                                  cancelText={t("common.cancel")}
                                  onConfirm={() => setFieldDecision(field.key, "reject")}
                                >
                                  <Button
                                    size="small"
                                    type={isRejected ? "primary" : "default"}
                                  >
                                    {t("admin.memoryDiffRejectField")}
                                  </Button>
                                </Popconfirm>
                              </div>
                            </div>
                            <div className="memory-diff-change-summary">
                              {suggestionText}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={t("admin.memoryDiffNoContentChange")}
                      />
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="memory-review-grid memory-review-grid-step-preview">
                <div className="memory-review-column memory-review-column-full">
                  <div className="memory-diff-preview-body">
                    <div className="memory-diff-preview-toolbar">
                      <Alert
                        type="info"
                        showIcon
                        message={t("admin.memoryDiffManualEditHint")}
                      />
                      <Space size={8}>
                        <Button
                          onClick={startPreviewContentEdit}
                          disabled={isPreviewContentEditing}
                        >
                          {t("admin.memoryDiffManualChange")}
                        </Button>
                        <Button
                          type="primary"
                          onClick={savePreviewContentEdit}
                          disabled={!isPreviewContentEditing}
                        >
                          {t("admin.memoryDiffManualSave")}
                        </Button>
                      </Space>
                    </div>
                    {isPreviewContentEditing ? (
                      <div className="memory-diff-unified memory-diff-manual-editor">
                        <Input.TextArea
                          value={manualPreviewContentDraft}
                          onChange={(event) =>
                            setManualPreviewContentDraft(event.target.value)
                          }
                          autoSize={false}
                          style={{ height: "100%", resize: "none" }}
                          className="memory-diff-manual-editor-input"
                          placeholder={t("admin.memoryDiffManualEditorPlaceholder")}
                        />
                      </div>
                    ) : (
                      <div className="memory-diff-unified">
                        {activeProposalDiff.lines.map((line, index) => (
                          <div
                            key={`${line.type}-${index}`}
                            className={`memory-diff-line is-${line.type}`}
                          >
                            <span className="memory-diff-prefix">
                              {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
                            </span>
                            <span>{line.text || " "}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="memory-diff-question-box">
                      <div className="memory-diff-question-inner">
                        <Input.TextArea
                          autoSize={{ minRows: 2, maxRows: 5 }}
                          className="memory-diff-question-input"
                          value={qaQuestionDraft}
                          onChange={(event) => setQaQuestionDraft(event.target.value)}
                          onKeyDown={handleReviewQuestionKeyDown}
                          placeholder={t("admin.memoryDiffQaQuestionPlaceholder")}
                        />
                        <div className="memory-diff-question-actions">
                          <Tooltip title={t("chat.send")}>
                            <button
                              type="button"
                              className="memory-diff-send-button"
                              onClick={sendReviewQuestion}
                              disabled={!qaQuestionDraft.trim().length}
                              aria-label={t("chat.send")}
                            >
                              <SendIcon />
                            </button>
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : isGlossaryDetailMode && glossaryDetailTarget ? (
        <div className="memory-glossary-detail-layout">
          <div className="memory-page-header">
            <div>
              <h2 className="admin-page-title">{t("admin.memoryGlossaryDetailTitle")}</h2>
              <p className="memory-page-subtitle">{glossaryDetailTarget.term}</p>
            </div>
            <Space>
              <Button onClick={closeGlossaryDetail}>{t("common.back")}</Button>
              {glossaryDetailExists ? (
                <Button
                  type="primary"
                  onClick={() => openModal("edit", glossaryDetailTarget)}
                >
                  {t("admin.memoryEditItem")}
                </Button>
              ) : null}
            </Space>
          </div>
          <div className="memory-glossary-detail-page">
            <div className="memory-glossary-detail-card">
              <div className="memory-glossary-detail-title">
                <h3>{glossaryDetailTarget.term}</h3>
                <Tag color={glossarySourceColorMap[glossaryDetailTarget.source]}>
                  {glossarySourceLabelMap[glossaryDetailTarget.source]}
                </Tag>
              </div>
              <div className="memory-form-field memory-form-field-full">
                <label>{t("admin.memoryGlossaryAliases")}</label>
                <div className="memory-tag-group">
                  {glossaryDetailTarget.aliases.length ? (
                    glossaryDetailTarget.aliases.map((alias) => (
                      <Tag key={`detail-${alias}`}>{alias}</Tag>
                    ))
                  ) : (
                    <span className="memory-content-preview">-</span>
                  )}
                </div>
              </div>
              <div className="memory-form-field memory-form-field-full">
                <label>{t("admin.memoryContent")}</label>
                <div className="memory-glossary-detail-content">
                  {glossaryDetailTarget.content}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="memory-page-header">
            <div>
              <h2 className="admin-page-title">{t("admin.memoryManagement")}</h2>
              <p className="memory-page-subtitle">
                {t("admin.memoryManagementSubtitle")}
              </p>
            </div>
            <Space>
              {activeTab === "experience" ? (
                <Space size={8}>
                  <span>{t("admin.memoryHabitFeatureToggle")}</span>
                  <Switch
                    checked={experienceFeatureEnabled}
                    checkedChildren={t("admin.enable")}
                    unCheckedChildren={t("admin.disable")}
                    onChange={setExperienceFeatureEnabled}
                  />
                </Space>
              ) : null}
              {activeTab === "glossary" ? (
                <Button onClick={() => setGlossaryInboxOpen(true)}>
                  {t("admin.memoryGlossaryInboxButton", {
                    count: glossaryChangeProposals.length,
                  })}
                </Button>
              ) : null}
              {activeTab !== "tools" && activeTab !== "experience" ? (
                <Button
                  type="primary"
                  className="admin-page-primary-button"
                  onClick={() => openModal("add")}
                >
                  {t("admin.memoryCreateButton", { unit: currentTabMeta.unit })}
                </Button>
              ) : null}
            </Space>
          </div>

          <div className="memory-summary-grid">
            {summaryCards.map((item) => (
              <div key={item.key} className={`memory-summary-card ${item.tone}`}>
                <div className="memory-summary-icon">{item.icon}</div>
                <div className="memory-summary-copy">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              </div>
            ))}
          </div>

          <div className="memory-tab-grid">
            {memoryTabOrder.map((tabKey) => {
              const tabItem = tabMeta[tabKey];
              const count =
                tabKey === "tools"
                  ? toolAssets.length
                  : tabKey === "skills"
                    ? skillAssets.length
                    : tabKey === "glossary"
                      ? glossaryAssets.length
                    : experienceAssets.length;

              return (
                <button
                  key={tabKey}
                  type="button"
                  className={`memory-tab-card ${activeTab === tabKey ? "is-active" : ""}`}
                  onClick={() => {
                    setActiveTab(tabKey);
                    if (tabKey !== "glossary") {
                      closeGlossaryDetail();
                    }
                    resetFilters();
                    syncShareParams(tabKey);
                  }}
                >
                  <span className="memory-tab-icon">{tabItem.icon}</span>
                  <span className="memory-tab-copy">
                    <strong>{tabItem.title}</strong>
                    <span>{tabItem.description}</span>
                  </span>
                  <span className="memory-tab-count">{count}</span>
                </button>
              );
            })}
          </div>

          {activeTab !== "experience" ? (
            <div className="memory-filter-bar">
              <Input.Search
                allowClear
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("admin.memorySearchPlaceholder", {
                  unit: currentTabMeta.unit,
                })}
                className="memory-filter-search"
              />
              {activeTab === "tools" || activeTab === "skills" ? (
                <>
                  <Select
                    allowClear
                    value={category}
                    placeholder={t("admin.memoryAllCategories")}
                    options={availableCategories.map((item) => ({
                      label: item,
                      value: item,
                    }))}
                    className="memory-filter-select"
                    onChange={(value) => setCategory(value)}
                  />
                  <Select
                    allowClear
                    value={tag}
                    placeholder={t("admin.memoryAllTags")}
                    options={availableTags.map((item) => ({
                      label: item,
                      value: item,
                    }))}
                    className="memory-filter-select"
                    onChange={(value) => setTag(value)}
                  />
                </>
              ) : activeTab === "glossary" ? (
                <Select
                  allowClear
                  value={glossarySource}
                  placeholder={t("admin.memoryAllSources")}
                  options={availableGlossarySourceOptions}
                  className="memory-filter-select"
                  onChange={(value) => setGlossarySource(value)}
                />
              ) : null}
              <Button onClick={resetFilters}>{t("admin.memoryReset")}</Button>
            </div>
          ) : null}

          {activeTab === "tools" ? (
            <Alert
              type="warning"
              showIcon
              message={t("admin.memoryReadonlyTitle")}
              description={t("admin.memoryReadonlyDescription")}
            />
          ) : null}

          {activeTab === "experience" ? (
            <Table<ExperienceAsset>
              className="admin-page-table memory-table"
              rowKey="id"
              dataSource={filteredExperienceItems}
              columns={experienceColumns}
              pagination={{ pageSize: 6, showSizeChanger: false }}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={t("admin.memoryEmpty")}
                  />
                ),
              }}
              scroll={{ x: 980 }}
            />
          ) : activeTab === "glossary" ? (
            <Table<GlossaryAsset>
              className="admin-page-table memory-table"
              rowKey="id"
              dataSource={filteredGlossaryItems}
              columns={glossaryColumns}
              tableLayout="fixed"
              pagination={{ pageSize: 6, showSizeChanger: false }}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={t("admin.memoryEmpty")}
                  />
                ),
              }}
              scroll={{ x: 1120 }}
            />
          ) : (
            <Table<StructuredAsset>
              className="admin-page-table memory-table"
              rowKey="id"
              dataSource={activeTab === "skills" ? filteredSkillTree : filteredStructuredItems}
              columns={genericColumns}
              pagination={{ pageSize: 6, showSizeChanger: false }}
              expandable={
                activeTab === "skills"
                  ? {
                      defaultExpandAllRows: true,
                      rowExpandable: (record) =>
                        skillAssets.some((item) => item.parentId === record.id),
                    }
                  : undefined
              }
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={t("admin.memoryEmpty")}
                  />
                ),
              }}
              scroll={{ x: 980 }}
            />
          )}
        </>
      )}

      <Modal
        open={glossaryInboxOpen}
        title={t("admin.memoryGlossaryInboxTitle")}
        onCancel={() => setGlossaryInboxOpen(false)}
        width={920}
        footer={[
          <Button key="close" onClick={() => setGlossaryInboxOpen(false)}>
            {t("common.close")}
          </Button>,
          <Button key="reject" onClick={rejectSelectedGlossaryProposals}>
            {t("admin.memoryGlossaryInboxReject")}
          </Button>,
          <Button key="accept" type="primary" onClick={acceptSelectedGlossaryProposals}>
            {t("admin.memoryGlossaryInboxAccept")}
          </Button>,
        ]}
      >
        {glossaryChangeProposals.length ? (
          <div className="memory-glossary-inbox">
            <div className="memory-glossary-inbox-toolbar">
              <Checkbox
                checked={isAllGlossaryProposalsSelected}
                indeterminate={isPartialGlossaryProposalSelected}
                onChange={(event) =>
                  setSelectedGlossaryProposalIds(
                    event.target.checked ? [...glossaryProposalIds] : [],
                  )
                }
              >
                {t("admin.memoryGlossaryInboxSelectAll")}
              </Checkbox>
              <span>
                {t("admin.memoryGlossaryInboxStats", {
                  selected: selectedGlossaryProposalIds.length,
                  total: glossaryChangeProposals.length,
                })}
              </span>
            </div>
            <div className="memory-glossary-inbox-list">
              {glossaryChangeProposals.map((proposal) => {
                const checked = selectedGlossaryProposalIds.includes(proposal.id);
                const isMergeProposal = Boolean(proposal.mergeFrom);
                const proposalTypeText = isMergeProposal
                  ? t("admin.memoryGlossaryInboxTypeMerge")
                  : proposal.before
                    ? t("admin.memoryGlossaryInboxTypeUpdate")
                    : t("admin.memoryGlossaryInboxTypeAdd");
                const [mergeLeftSource, mergeRightSource] = proposal.mergeFrom ?? [];

                return (
                  <div key={proposal.id} className="memory-glossary-inbox-card">
                    <div className="memory-glossary-inbox-card-head">
                      <Checkbox
                        checked={checked}
                        onChange={(event) =>
                          setSelectedGlossaryProposalIds((previous) =>
                            event.target.checked
                              ? [...previous, proposal.id]
                              : previous.filter((id) => id !== proposal.id),
                          )
                        }
                      >
                        {proposal.after.term}
                      </Checkbox>
                      <Space size={8}>
                        <Tag color="blue">{proposalTypeText}</Tag>
                        <Tag color={glossarySourceColorMap[proposal.after.source]}>
                          {glossarySourceLabelMap[proposal.after.source]}
                        </Tag>
                      </Space>
                    </div>
                    <div className="memory-glossary-inbox-card-body">
                      <div className="memory-glossary-inbox-card-line">
                        <strong>{t("admin.memoryGlossaryInboxReason")}</strong>
                        <span>{proposal.reason}</span>
                      </div>
                      {isMergeProposal && mergeLeftSource && mergeRightSource ? (
                        <div className="memory-glossary-inbox-merge">
                          <strong>{t("admin.memoryGlossaryInboxMergeLabel")}</strong>
                          <div className="memory-glossary-merge-flow">
                            <div className="memory-glossary-merge-node">
                              <span className="memory-glossary-merge-node-label">
                                {t("admin.memoryGlossaryInboxMergeFromA")}
                              </span>
                              <strong className="memory-glossary-merge-term">
                                {mergeLeftSource.term}
                              </strong>
                              <div className="memory-tag-group memory-glossary-merge-tags">
                                {mergeLeftSource.aliases.length ? (
                                  mergeLeftSource.aliases.map((alias) => (
                                    <Tag key={`${proposal.id}-${mergeLeftSource.id}-${alias}`}>
                                      {alias}
                                    </Tag>
                                  ))
                                ) : (
                                  <span className="memory-content-preview">-</span>
                                )}
                              </div>
                              <span className="memory-glossary-merge-content">
                                {mergeLeftSource.content}
                              </span>
                            </div>
                            <span className="memory-glossary-merge-operator">+</span>
                            <div className="memory-glossary-merge-node">
                              <span className="memory-glossary-merge-node-label">
                                {t("admin.memoryGlossaryInboxMergeFromB")}
                              </span>
                              <strong className="memory-glossary-merge-term">
                                {mergeRightSource.term}
                              </strong>
                              <div className="memory-tag-group memory-glossary-merge-tags">
                                {mergeRightSource.aliases.length ? (
                                  mergeRightSource.aliases.map((alias) => (
                                    <Tag key={`${proposal.id}-${mergeRightSource.id}-${alias}`}>
                                      {alias}
                                    </Tag>
                                  ))
                                ) : (
                                  <span className="memory-content-preview">-</span>
                                )}
                              </div>
                              <span className="memory-glossary-merge-content">
                                {mergeRightSource.content}
                              </span>
                            </div>
                            <span className="memory-glossary-merge-arrow">-&gt;</span>
                            <div className="memory-glossary-merge-node is-result">
                              <span className="memory-glossary-merge-node-label">
                                {t("admin.memoryGlossaryInboxMergeResult")}
                              </span>
                              <strong className="memory-glossary-merge-term">
                                {proposal.after.term}
                              </strong>
                              <div className="memory-tag-group memory-glossary-merge-tags">
                                {proposal.after.aliases.length ? (
                                  proposal.after.aliases.map((alias) => (
                                    <Tag key={`${proposal.id}-merged-${alias}`}>{alias}</Tag>
                                  ))
                                ) : (
                                  <span className="memory-content-preview">-</span>
                                )}
                              </div>
                              <span className="memory-glossary-merge-content">
                                {proposal.after.content}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="memory-glossary-inbox-card-line">
                            <strong>{t("admin.memoryGlossaryAliases")}</strong>
                            <div className="memory-tag-group memory-tag-group-scroll">
                              {proposal.after.aliases.length ? (
                                proposal.after.aliases.map((alias) => (
                                  <Tag key={`${proposal.id}-${alias}`}>{alias}</Tag>
                                ))
                              ) : (
                                <span className="memory-content-preview">-</span>
                              )}
                            </div>
                          </div>
                          <div className="memory-glossary-inbox-card-line">
                            <strong>{t("admin.memoryContent")}</strong>
                            <span className="memory-content-preview memory-content-preview-glossary">
                              {proposal.after.content}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="memory-glossary-inbox-card-actions">
                      <Button
                        size="small"
                        onClick={() => {
                          setGlossaryInboxOpen(false);
                          openGlossaryDetail(proposal.after);
                        }}
                      >
                        {t("admin.memoryGlossaryInboxDetail")}
                      </Button>
                      <Button size="small" onClick={() => rejectGlossaryProposals([proposal])}>
                        {t("admin.memoryGlossaryInboxReject")}
                      </Button>
                      <Button
                        size="small"
                        type="primary"
                        onClick={() => applyGlossaryProposals([proposal])}
                      >
                        {t("admin.memoryGlossaryInboxAccept")}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t("admin.memoryGlossaryInboxEmpty")}
          />
        )}
      </Modal>

      <Modal
        open={modalOpen}
        title={modalTitle}
        onCancel={closeModal}
        onOk={isReadOnly ? closeModal : saveDraft}
        okText={isReadOnly ? t("common.close") : t("common.save")}
        cancelText={t("common.cancel")}
        destroyOnClose
        width={760}
      >
        {activeTab === "experience" ? (
          <div className="memory-modal-grid">
            <div className="memory-form-field">
              <label>{t("admin.memoryTitle")}</label>
              <Input
                value={draft.title}
                readOnly={isReadOnly}
                placeholder={t("common.pleaseInput") + t("admin.memoryTitle")}
                onChange={(event) =>
                  setDraft((previous) => ({ ...previous, title: event.target.value }))
                }
              />
            </div>
            <div className="memory-form-field memory-form-field-full">
              <label>{t("admin.memoryContent")}</label>
              <Input.TextArea
                rows={9}
                value={draft.content}
                readOnly={isReadOnly}
                placeholder={t("common.pleaseInput") + t("admin.memoryContent")}
                onChange={(event) =>
                  setDraft((previous) => ({ ...previous, content: event.target.value }))
                }
              />
            </div>
          </div>
        ) : activeTab === "glossary" ? (
          <div className="memory-modal-grid">
            <div className="memory-form-field memory-form-field-full">
              <label>{t("admin.memoryGlossaryTerm")}</label>
              <Input
                value={draft.term}
                readOnly={isReadOnly}
                placeholder={t("common.pleaseInput") + t("admin.memoryGlossaryTerm")}
                onChange={(event) =>
                  setDraft((previous) => ({ ...previous, term: event.target.value }))
                }
              />
            </div>
            <div className="memory-form-field memory-form-field-full">
              <label>{t("admin.memoryGlossaryAliases")}</label>
              <Select
                mode="tags"
                value={draft.aliases}
                disabled={isReadOnly}
                placeholder={t("admin.memoryGlossaryAliasesPlaceholder")}
                onChange={(value) =>
                  setDraft((previous) => ({ ...previous, aliases: value }))
                }
              />
            </div>
            <div className="memory-form-field memory-form-field-full">
              <label>{t("admin.memoryContent")}</label>
              <Input.TextArea
                rows={10}
                value={draft.content}
                readOnly={isReadOnly}
                placeholder={t("common.pleaseInput") + t("admin.memoryContent")}
                onChange={(event) =>
                  setDraft((previous) => ({ ...previous, content: event.target.value }))
                }
              />
            </div>
          </div>
        ) : (
          <div className="memory-modal-grid">
            <div className="memory-form-field memory-form-field-full">
              <label>{t("admin.memoryName")}</label>
              <Input
                value={draft.name}
                readOnly={isReadOnly}
                placeholder={t("common.pleaseInput") + t("admin.memoryName")}
                onChange={(event) =>
                  setDraft((previous) => ({ ...previous, name: event.target.value }))
                }
              />
            </div>
            {!isChildSkillDraft ? (
              <div className="memory-form-field memory-form-field-full">
                <label>{t("admin.memoryDescription")}</label>
                <Input
                  value={draft.description}
                  readOnly={isReadOnly}
                  placeholder={t("common.pleaseInput") + t("admin.memoryDescription")}
                  onChange={(event) =>
                    setDraft((previous) => ({
                      ...previous,
                      description: event.target.value,
                    }))
                  }
                />
              </div>
            ) : null}
            {activeTab === "skills" ? (
              <div className="memory-form-field">
                <label>{t("admin.memoryParentSkill")}</label>
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  value={draft.parentId || undefined}
                  disabled={isReadOnly}
                  placeholder={t("admin.memoryParentSkillPlaceholder")}
                  options={parentSkillOptions}
                  onChange={(value) =>
                    setDraft((previous) => ({
                      ...previous,
                      parentId: value || "",
                      childSkills: value ? [] : previous.childSkills,
                    }))
                  }
                />
                <span className="memory-form-hint">{t("admin.memoryRootSkill")}</span>
              </div>
            ) : null}
            {!isChildSkillDraft ? (
              <>
                <div className="memory-form-field">
                  <label>{t("admin.memoryCategory")}</label>
                  <Input
                    value={draft.category}
                    readOnly={isReadOnly}
                    placeholder={t("admin.memoryCategoryPlaceholder")}
                    onChange={(event) =>
                      setDraft((previous) => ({ ...previous, category: event.target.value }))
                    }
                  />
                </div>
                <div className="memory-form-field">
                  <label>{t("admin.memoryTagSet")}</label>
                  <Select
                    mode="multiple"
                    value={draft.tags}
                    disabled={isReadOnly}
                    placeholder={t("admin.memoryTagsPlaceholder")}
                    onChange={(value) =>
                      setDraft((previous) => ({ ...previous, tags: value }))
                    }
                    options={tagOptions}
                  />
                  <span className="memory-form-hint">{t("admin.memoryTagsHint")}</span>
                </div>
              </>
            ) : null}
            <div className="memory-form-field memory-form-field-full">
              <label>{t("admin.memoryMarkdown")}</label>
              <Input.TextArea
                rows={10}
                value={draft.content}
                readOnly={isReadOnly}
                placeholder={t("common.pleaseInput") + t("admin.memoryContent")}
                onChange={(event) =>
                  setDraft((previous) => ({ ...previous, content: event.target.value }))
                }
              />
              {activeTab === "skills" ? (
                <div className="memory-upload-actions">
                  <Upload
                    {...createSkillUploadProps()}
                    disabled={isReadOnly}
                  >
                    <Button
                      icon={<UploadOutlined />}
                      disabled={isReadOnly}
                    >
                      {t("admin.memoryUploadSkillFile")}
                    </Button>
                  </Upload>
                  <span className="memory-form-hint">
                    {t("admin.memoryUploadSkillFileHint")}
                  </span>
                </div>
              ) : null}
            </div>
            {activeTab === "skills" && modalMode === "add" && !draft.parentId ? (
              <div className="memory-form-field memory-form-field-full memory-child-skill-section">
                <div className="memory-child-skill-header">
                  <label>{t("admin.memoryChildSkillSection")}</label>
                  <Button
                    size="small"
                    disabled={isReadOnly}
                    onClick={addChildSkillDraft}
                  >
                    {t("admin.memoryChildSkillAdd")}
                  </Button>
                </div>
                {draft.childSkills.length ? (
                  <div className="memory-child-skill-list">
                    {draft.childSkills.map((child, index) => (
                      <div key={child.tempId} className="memory-child-skill-card">
                        <div className="memory-child-skill-card-header">
                          <strong>{`${t("admin.memoryChildSkill")} ${index + 1}`}</strong>
                          <Button
                            type="text"
                            danger
                            size="small"
                            disabled={isReadOnly}
                            icon={<DeleteOutlined />}
                            onClick={() => removeChildSkillDraft(child.tempId)}
                          >
                            {t("admin.memoryChildSkillRemove")}
                          </Button>
                        </div>

                        <div className="memory-child-skill-grid">
                          <div className="memory-form-field">
                            <label>{t("admin.memoryName")}</label>
                            <Input
                              value={child.name}
                              readOnly={isReadOnly}
                              placeholder={t("common.pleaseInput") + t("admin.memoryName")}
                              onChange={(event) =>
                                updateChildSkillDraft(child.tempId, {
                                  name: event.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="memory-form-field memory-form-field-full">
                            <label>{t("admin.memoryMarkdown")}</label>
                            <Input.TextArea
                              rows={6}
                              value={child.content}
                              readOnly={isReadOnly}
                              placeholder={
                                t("common.pleaseInput") + t("admin.memoryContent")
                              }
                              onChange={(event) =>
                                updateChildSkillDraft(child.tempId, {
                                  content: event.target.value,
                                })
                              }
                            />
                            <div className="memory-upload-actions">
                              <Upload
                                {...createSkillUploadProps(child.tempId)}
                                disabled={isReadOnly}
                              >
                                <Button
                                  icon={<UploadOutlined />}
                                  disabled={isReadOnly}
                                >
                                  {t("admin.memoryUploadSkillFile")}
                                </Button>
                              </Upload>
                              <span className="memory-form-hint">
                                {t("admin.memoryUploadSkillFileHint")}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="memory-form-hint">{t("admin.memoryChildSkillEmpty")}</span>
                )}
              </div>
            ) : null}
          </div>
        )}

        {activeTab !== "tools" && !isChildSkillDraft ? (
          <label className={`memory-lock-toggle ${isReadOnly ? "is-disabled" : ""}`}>
            <input
              type="checkbox"
              checked={draft.protect}
              disabled={isReadOnly}
              onChange={(event) =>
                setDraft((previous) => ({ ...previous, protect: event.target.checked }))
              }
            />
            <span>{t("admin.memoryProtect")}</span>
          </label>
        ) : null}
      </Modal>

      <Modal
        open={shareModalOpen}
        title={t("admin.memoryShareDialogTitle")}
        onCancel={closeShareModal}
        onOk={handleConfirmShare}
        okText={t("admin.memoryShareSubmit")}
        cancelText={t("common.cancel")}
        width={720}
      >
        {shareTarget ? (
          <div className="memory-share-modal">
            <div className="memory-share-summary">
              <div className="memory-share-summary-title">
                {"title" in shareTarget.item
                  ? shareTarget.item.title
                  : shareTarget.item.name}
              </div>
              <div className="memory-share-summary-desc">
                {shareTarget.tab === "skills"
                  ? t("admin.memoryShareSkillHint")
                  : t("admin.memoryShareExperienceHint")}
              </div>
            </div>

            <div className="memory-share-grid">
              <div className="memory-form-field">
                <label>{t("admin.memoryShareGroups")}</label>
                <Select
                  mode="multiple"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder={t("admin.memoryShareGroupsPlaceholder")}
                  value={shareDraft.groupIds}
                  loading={shareLoading}
                  options={shareGroups.map((item) => ({
                    label: item.group_name,
                    value: item.group_id,
                  }))}
                  onChange={(value) =>
                    setShareDraft((previous) => ({ ...previous, groupIds: value }))
                  }
                />
              </div>

              <div className="memory-form-field">
                <label>{t("admin.memoryShareUsers")}</label>
                <Select
                  mode="multiple"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder={t("admin.memoryShareUsersPlaceholder")}
                  value={shareDraft.userIds}
                  loading={shareLoading}
                  options={shareUsers.map((item) => ({
                    label: item.display_name
                      ? `${item.display_name} (${item.username})`
                      : item.username,
                    value: item.user_id,
                  }))}
                  onChange={(value) =>
                    setShareDraft((previous) => ({ ...previous, userIds: value }))
                  }
                />
              </div>
            </div>

            <div className="memory-share-selected">
              <div className="memory-share-selected-title">
                {t("admin.memoryShareCurrentRecipients")}
              </div>
              <div className="memory-share-selected-tags">
                {shareDraft.groupIds.map((groupId) => {
                  const matchedGroup = shareGroups.find((item) => item.group_id === groupId);
                  return matchedGroup ? (
                    <Tag key={groupId} color="blue">
                      {matchedGroup.group_name}
                    </Tag>
                  ) : null;
                })}
                {shareDraft.userIds.map((userId) => {
                  const matchedUser = shareUsers.find((item) => item.user_id === userId);
                  return matchedUser ? (
                    <Tag key={userId} color="green">
                      {matchedUser.display_name || matchedUser.username}
                    </Tag>
                  ) : null;
                })}
                {!shareDraft.groupIds.length && !shareDraft.userIds.length ? (
                  <span className="memory-share-empty">
                    {t("admin.memoryShareEmptyRecipients")}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="memory-share-actions">
              <Button
                icon={<LinkOutlined />}
                onClick={() => handleCopyShareLink(shareTarget.tab, shareTarget.item)}
              >
                {t("admin.memoryShareCopyLink")}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
