import { useMemo, useState, type ReactNode } from "react";
import {
  Collapse,
  Dropdown,
  Input,
  Table,
  Tag,
  Typography,
  type MenuProps,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  CheckCircleFilled,
  CloseOutlined,
  ClockCircleFilled,
  CloudUploadOutlined,
  FileTextOutlined,
  DownOutlined,
  ExperimentOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DatabaseOutlined,
  MessageOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { useOutletContext } from "react-router-dom";
import SendIcon from "@/modules/chat/assets/icons/send_icon.svg?react";
import MarkdownViewer from "@/modules/knowledge/components/MarkdownViewer";
import { pxReportCaseMetrics } from "./mockPxReport";
import analysisReportMarkdown from "./mockAnalysisReport.md?raw";
import codeOptimizeDiff from "./mockCodeOptimize.diff?raw";
import "./index.scss";

const { Paragraph, Text, Title } = Typography;

type EvolutionMode = "auto" | "interactive";
type StepStatus = "running" | "pending" | "done";
type ChatRole = "user" | "assistant";

type WorkflowAction = {
  key: string;
  label: string;
  icon: ReactNode;
};

type WorkflowStep = {
  id: string;
  title: string;
  desc: string;
  status: StepStatus;
  actions: WorkflowAction[];
};

type EvalCaseItem = {
  case_id: string;
  reference_doc: string[];
  reference_context: string[];
  is_deleted: boolean;
  question: string;
  question_type: number;
  key_point: string[];
  ground_truth: string;
};

type EvalDataset = {
  eval_set_id: string;
  eval_name: string;
  kb_id: string;
  task_id: string;
  create_time: string;
  total_nums: number;
  cases: EvalCaseItem[];
};

type EvalCaseRow = {
  key: string;
  index: number;
  question_type: string;
  reference_doc: string;
  reference_context: string;
  question: string;
  key_point: string;
  ground_truth: string;
};

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  time: string;
};

type ChatSession = {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
};

type ParsedDiffFile = {
  id: string;
  fromPath: string;
  toPath: string;
  displayPath: string;
  lines: string[];
  additions: number;
  deletions: number;
};

type DiffFileTreeNode = {
  name: string;
  path: string;
  nodeType: "dir" | "file";
  fileId?: string;
  children: DiffFileTreeNode[];
};

type SelfEvolutionLayoutContext = {
  isMenuCollapsed: boolean;
  toggleMenu: () => void;
};

type PxMetricKey = "answer_correctness" | "faithfulness" | "context_recall" | "doc_recall";

type PxCategoryMetricAverage = {
  category: string;
  caseCount: number;
  metrics: Record<PxMetricKey, number>;
};

const pxMetricMeta: Array<{ key: PxMetricKey; label: string; color: string }> = [
  { key: "answer_correctness", label: "答案正确性", color: "#1a73e8" },
  { key: "faithfulness", label: "忠实性", color: "#22a06b" },
  { key: "context_recall", label: "上下文召回", color: "#f08c00" },
  { key: "doc_recall", label: "文档召回", color: "#7048e8" },
];

const knowledgeBaseOptions = [
  {
    label: "沪派江南知识库（示例）",
    value: "ds_e030b437e04837ef4dbb952d45e16902",
  },
  {
    label: "城市更新知识库（示例）",
    value: "ds_urban_update_example",
  },
  {
    label: "文旅问答知识库（示例）",
    value: "ds_culture_tour_example",
  },
];

const workflowSteps: WorkflowStep[] = [
  {
    id: "dataset",
    title: "Step 1 · 生成数据集",
    desc: "将任务目标拆分为训练样本，生成数据集数据并写入自进化流水线。",
    status: "running",
    actions: [{ key: "retry", label: "重跑", icon: <ReloadOutlined /> }],
  },
  {
    id: "px-report",
    title: "Step 2 · PX 评测报告",
    desc: "基于数据集生成首轮评测报告，建立效果基线。",
    status: "pending",
    actions: [{ key: "run", label: "执行", icon: <PlayCircleOutlined /> }],
  },
  {
    id: "analysis",
    title: "Step 3 · CH 分析报告",
    desc: "自动分析误答样本，产出问题归因和优先级建议。",
    status: "pending",
    actions: [{ key: "run", label: "执行", icon: <FileTextOutlined /> }],
  },
  {
    id: "code-optimize",
    title: "Step 4 · CH 代码优化",
    desc: "根据分析结论给出可执行改造项，形成优化清单。",
    status: "pending",
    actions: [{ key: "run", label: "执行", icon: <ExperimentOutlined /> }],
  },
  {
    id: "ab-test",
    title: "Step 5 · PX A/B Test",
    desc: "执行对照实验并上传新评测报告，确认优化收益。",
    status: "pending",
    actions: [{ key: "upload", label: "上传", icon: <CloudUploadOutlined /> }],
  },
];

const evalSetPreviewData: EvalDataset = {
  eval_set_id: "b2e1616d-3d60-4327-9995-3d700e0a6e81",
  eval_name: "string4",
  kb_id: "ds_e030b437e04837ef4dbb952d45e16902",
  task_id: "379cffde-e43b-4f61-8310-d578f3094f6c",
  create_time: "2026-04-18 18:42:46",
  total_nums: 6,
  cases: [
    {
      case_id: "55b6c4b2-0bf7-4abf-8445-7d0e9acc553d",
      reference_doc: ["20384-【沪派江南】乡土行纪  第十四辑：水美林幽·风物万象.pdf"],
      reference_context: [
        "随后，大家来到大石皮村乡村生活馆，领略徐行草编文化的独特魅力。年轻的非遗传承人陈姣为大家讲述了徐行草编的历史渊源，作为江南著名的草编之乡，徐行草编以精湛的工艺和深厚的文化底蕴，于2008年入选第二批国家级非物质文化遗产名录。",
      ],
      is_deleted: false,
      question: "徐行草编于何时入选国家级非物质文化遗产名录？",
      question_type: 1,
      key_point: ["答题关键点"],
      ground_truth: "2008年入选第二批国家级非物质文化遗产名录",
    },
    {
      case_id: "04c504d7-ba7c-4bfb-8b78-5f1b3ca2802b",
      reference_doc: ["20387-【沪派江南】从水库村之变，理解沪派江南.pdf"],
      reference_context: [
        "水庫村採用“三師聯創”機制，保留了水網、疏浚河道、搭建23座橋梁打通水系；引入數字遊民打造全域全場景示範區，利用閒置空間開展100多場活動；設計宅基地安置點時保留菜地尊重傳統生活方式。",
      ],
      is_deleted: false,
      question:
        "水庫村在鄉村振興過程中，如何通過“三師聯創”機制，既保護了江南水鄉的水網風貌，又引入數字遊民實現產業創新，同時保留村民傳統生活方式？",
      question_type: 2,
      key_point: ["答题关键点"],
      ground_truth:
        "水庫村採用“三師聯創”機制，由規劃師、建築師、景觀師聯合設計，首先保留了水網密布的地理特徵，將河道疏浚整治、搭建橋梁打通水系、恢復濕地生態，而非填河為路，既保護了江南田園風貌又兼顧交通。同時引入數字遊民社區，利用村內閒置空間打造工作場景，開展各類活動為鄉村注入青年活力和產業機會，並通過企業會議、項目落地帶動經濟發展。在村民安置方面，設計江南風貌的別墅區並特意保留菜地，讓農戶延續種菜生活方式，避免城市化帶來的“不適應”。這種模式體現了生態保護、產業創新與文化傳承的協調發展。",
    },
  ],
};

const evalCaseColumns: ColumnsType<EvalCaseRow> = [
  { title: "序号", dataIndex: "index", key: "index", width: 80, fixed: "left" },
  { title: "问题类型", dataIndex: "question_type", key: "question_type", width: 120 },
  {
    title: "问题",
    dataIndex: "question",
    key: "question",
    width: 320,
    render: (value: string) => (
      <span className="self-evolution-table-ellipsis" title={value}>
        {value}
      </span>
    ),
  },
  {
    title: "标准答案",
    dataIndex: "ground_truth",
    key: "ground_truth",
    width: 360,
    render: (value: string) => (
      <span className="self-evolution-table-ellipsis" title={value}>
        {value}
      </span>
    ),
  },
  {
    title: "参考文档",
    dataIndex: "reference_doc",
    key: "reference_doc",
    width: 320,
    render: (value: string) => (
      <span className="self-evolution-table-ellipsis" title={value}>
        {value}
      </span>
    ),
  },
  {
    title: "参考上下文",
    dataIndex: "reference_context",
    key: "reference_context",
    width: 420,
    render: (value: string) => (
      <span className="self-evolution-table-ellipsis" title={value}>
        {value}
      </span>
    ),
  },
  {
    title: "关键点",
    dataIndex: "key_point",
    key: "key_point",
    width: 220,
    render: (value: string) => (
      <span className="self-evolution-table-ellipsis" title={value}>
        {value}
      </span>
    ),
  },
];

const questionTypeLabelMap: Record<number, string> = {
  1: "单跳",
  2: "多跳",
  3: "公式",
  4: "表格",
  5: "代码",
};

const formatQuestionType = (questionType: number) => {
  const label = questionTypeLabelMap[questionType];
  if (!label) {
    return String(questionType);
  }
  return label;
};

const clampScore = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
};

const formatQuestionCategory = (questionType: number | string | null | undefined) => {
  if (typeof questionType === "number") {
    return formatQuestionType(questionType);
  }
  if (typeof questionType === "string" && questionType.trim()) {
    const normalized = Number(questionType);
    if (Number.isFinite(normalized)) {
      return formatQuestionType(normalized);
    }
    return questionType;
  }
  return "未分类";
};

const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

const buildPxCategoryMetricAverages = (
  cases: Array<{
    question_type: number | string | null;
    answer_correctness: number | null;
    faithfulness: number | null;
    context_recall: number | null;
    doc_recall: number | null;
  }>,
): PxCategoryMetricAverage[] => {
  const grouped = new Map<
    string,
    {
      category: string;
      caseCount: number;
      sums: Record<PxMetricKey, number>;
      counts: Record<PxMetricKey, number>;
    }
  >();

  for (const item of cases) {
    const category = formatQuestionCategory(item.question_type);
    if (!grouped.has(category)) {
      grouped.set(category, {
        category,
        caseCount: 0,
        sums: {
          answer_correctness: 0,
          faithfulness: 0,
          context_recall: 0,
          doc_recall: 0,
        },
        counts: {
          answer_correctness: 0,
          faithfulness: 0,
          context_recall: 0,
          doc_recall: 0,
        },
      });
    }

    const bucket = grouped.get(category);
    if (!bucket) {
      continue;
    }
    bucket.caseCount += 1;

    for (const metric of pxMetricMeta) {
      const value = item[metric.key];
      if (typeof value === "number" && Number.isFinite(value)) {
        bucket.sums[metric.key] += clampScore(value);
        bucket.counts[metric.key] += 1;
      }
    }
  }

  return Array.from(grouped.values())
    .map((bucket) => ({
      category: bucket.category,
      caseCount: bucket.caseCount,
      metrics: {
        answer_correctness:
          bucket.counts.answer_correctness > 0
            ? bucket.sums.answer_correctness / bucket.counts.answer_correctness
            : 0,
        faithfulness: bucket.counts.faithfulness > 0 ? bucket.sums.faithfulness / bucket.counts.faithfulness : 0,
        context_recall:
          bucket.counts.context_recall > 0 ? bucket.sums.context_recall / bucket.counts.context_recall : 0,
        doc_recall: bucket.counts.doc_recall > 0 ? bucket.sums.doc_recall / bucket.counts.doc_recall : 0,
      },
    }))
    .sort((a, b) => a.category.localeCompare(b.category, "zh-CN", { numeric: true }));
};

function getTimeLabel() {
  return new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getSessionTitleByMessage(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return "新会话";
  }
  return trimmed.length > 10 ? `${trimmed.slice(0, 10)}...` : trimmed;
}

function getDiffLineType(line: string) {
  if (line.startsWith("+++ ") || line.startsWith("--- ") || line.startsWith("diff --git") || line.startsWith("index ")) {
    return "meta";
  }
  if (line.startsWith("@@")) {
    return "hunk";
  }
  if (line.startsWith("+")) {
    return "add";
  }
  if (line.startsWith("-")) {
    return "remove";
  }
  return "context";
}

function normalizeDiffPath(path: string) {
  const cleaned = path.replace(/^([ab])\//, "");
  const lazyRagIndex = cleaned.indexOf("LazyRAG/");
  if (lazyRagIndex >= 0) {
    return cleaned.slice(lazyRagIndex + "LazyRAG/".length);
  }
  return cleaned;
}

function parseUnifiedDiff(diffText: string): ParsedDiffFile[] {
  const lines = diffText.split("\n");
  const files: ParsedDiffFile[] = [];
  let currentFile: ParsedDiffFile | null = null;
  let fileIndex = 0;

  const pushCurrent = () => {
    if (currentFile) {
      files.push(currentFile);
      currentFile = null;
    }
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      pushCurrent();
      fileIndex += 1;
      const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      const fromPath = match?.[1] || "";
      const toPath = match?.[2] || fromPath || "unknown-file";
      currentFile = {
        id: `diff-file-${fileIndex}`,
        fromPath,
        toPath,
        displayPath: normalizeDiffPath(toPath),
        lines: [line],
        additions: 0,
        deletions: 0,
      };
      continue;
    }

    if (!currentFile) {
      currentFile = {
        id: "diff-file-fallback",
        fromPath: "unknown-file",
        toPath: "unknown-file",
        displayPath: "unknown-file",
        lines: [],
        additions: 0,
        deletions: 0,
      };
    }

    currentFile.lines.push(line);
    if (line.startsWith("+") && !line.startsWith("+++")) {
      currentFile.additions += 1;
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      currentFile.deletions += 1;
    }
  }

  pushCurrent();
  return files;
}

function buildDiffFileTree(files: ParsedDiffFile[]): DiffFileTreeNode[] {
  const tree: DiffFileTreeNode[] = [];

  const ensureDirNode = (nodes: DiffFileTreeNode[], name: string, path: string) => {
    let dirNode = nodes.find((node) => node.nodeType === "dir" && node.path === path);
    if (!dirNode) {
      dirNode = {
        name,
        path,
        nodeType: "dir",
        children: [],
      };
      nodes.push(dirNode);
    }
    return dirNode;
  };

  for (const file of files) {
    const segments = file.displayPath.split("/").filter(Boolean);
    let currentNodes = tree;
    let currentPath = "";

    segments.forEach((segment, index) => {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const isLeafFile = index === segments.length - 1;

      if (isLeafFile) {
        const exists = currentNodes.some(
          (node) => node.nodeType === "file" && node.path === currentPath && node.fileId === file.id,
        );
        if (!exists) {
          currentNodes.push({
            name: segment,
            path: currentPath,
            nodeType: "file",
            fileId: file.id,
            children: [],
          });
        }
      } else {
        const dirNode = ensureDirNode(currentNodes, segment, currentPath);
        currentNodes = dirNode.children;
      }
    });
  }

  const sortNodes = (nodes: DiffFileTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.nodeType !== b.nodeType) {
        return a.nodeType === "dir" ? -1 : 1;
      }
      return a.name.localeCompare(b.name, "zh-CN", { numeric: true });
    });
    nodes.forEach((node) => sortNodes(node.children));
  };
  sortNodes(tree);
  return tree;
}

export default function SelfEvolutionPage() {
  const layoutContext = useOutletContext<SelfEvolutionLayoutContext | undefined>();
  const [mode, setMode] = useState<EvolutionMode>("interactive");
  const [selectedKb, setSelectedKb] = useState<string>();
  const [prompt, setPrompt] = useState("");
  const [isWorkbenchVisible, setIsWorkbenchVisible] = useState(false);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([
    {
      id: "session-1",
      title: "当前会话",
      updatedAt: "刚刚",
      messages: [],
    },
  ]);
  const [activeSessionId, setActiveSessionId] = useState("session-1");
  const [activeDiffFileId, setActiveDiffFileId] = useState("");
  const selectedKnowledgeBase =
    knowledgeBaseOptions.find((item) => item.value === selectedKb)?.label || "知识库";
  const modeLabel = mode === "auto" ? "自动处理" : "交互处理";
  const isKnowledgeBaseRequired = !selectedKb;
  const isSendDisabled = !prompt.trim();
  const activeStepText = useMemo(
    () => workflowSteps.find((item) => item.status === "running")?.title || "等待启动",
    [],
  );
  const isMenuCollapsed = layoutContext?.isMenuCollapsed ?? true;
  const toggleMenu = layoutContext?.toggleMenu;
  const evalCaseRows = useMemo<EvalCaseRow[]>(
    () =>
      evalSetPreviewData.cases.map((item, index) => ({
        key: item.case_id,
        index: index + 1,
        question_type: formatQuestionType(item.question_type),
        reference_doc: item.reference_doc.join("；"),
        reference_context: item.reference_context.join("；"),
        question: item.question,
        key_point: item.key_point.join("；"),
        ground_truth: item.ground_truth,
      })),
    [],
  );
  const pxCategoryMetricAverages = useMemo<PxCategoryMetricAverage[]>(
    () => buildPxCategoryMetricAverages(pxReportCaseMetrics),
    [],
  );
  const isSinglePxCategory = pxCategoryMetricAverages.length === 1;
  const parsedDiffFiles = useMemo(() => parseUnifiedDiff(codeOptimizeDiff), []);
  const diffFileTree = useMemo(() => buildDiffFileTree(parsedDiffFiles), [parsedDiffFiles]);
  const activeDiffFile = parsedDiffFiles.find((item) => item.id === activeDiffFileId) || parsedDiffFiles[0];
  const activeSession = chatSessions.find((item) => item.id === activeSessionId) || chatSessions[0];
  const activeMessages = activeSession?.messages ?? [];

  const knowledgeBaseMenuItems: MenuProps["items"] = [
    ...knowledgeBaseOptions.map((item) => ({
      key: item.value,
      label: item.label,
    })),
  ];

  const modeMenuItems: MenuProps["items"] = [
    { key: "auto", label: "自动处理" },
    { key: "interactive", label: "交互处理" },
  ];

  const onSend = () => {
    const trimmedPrompt = prompt.trim();
    if (isKnowledgeBaseRequired) {
      message.warning("必须选择知识库才可以生成数据集。", 1.2);
      return;
    }
    if (!trimmedPrompt) {
      return;
    }

    const firstRound = !isWorkbenchVisible;
    const assistantReply = firstRound
      ? `已收到任务「${trimmedPrompt}」，进入第一步：生成数据集。我会先产出样本结构和数据集数据。`
      : "已继续推进当前流程，我会优先补齐数据集样本并回传下一步状态。";

    const nowLabel = getTimeLabel();
    const nextMessages: ChatMessage[] = [
      ...activeMessages,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmedPrompt,
        time: nowLabel,
      },
      {
        id: `assistant-${Date.now() + 1}`,
        role: "assistant",
        content: assistantReply,
        time: nowLabel,
      },
    ];

    setChatSessions((prev) =>
      prev.map((session) =>
        session.id === activeSessionId
          ? {
              ...session,
              title: session.messages.length === 0 ? getSessionTitleByMessage(trimmedPrompt) : session.title,
              updatedAt: nowLabel,
              messages: nextMessages,
            }
          : session,
      ),
    );

    if (firstRound) {
      setIsWorkbenchVisible(true);
      message.success(`已基于「${selectedKnowledgeBase}」启动流程：${activeStepText}`, 1.2);
    }
    setPrompt("");
  };

  const onStartSession = () => {
    if (isKnowledgeBaseRequired) {
      message.warning("必须先选择知识库才可以开始。", 1.2);
      return;
    }
    setIsWorkbenchVisible(true);
    if (activeMessages.length === 0) {
      const nowLabel = getTimeLabel();
      const introMessage: ChatMessage[] = [
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: `已基于「${selectedKnowledgeBase}」以「${modeLabel}」启动流程，进入第一步：生成数据集。`,
          time: nowLabel,
        },
      ];
      setChatSessions((prev) =>
        prev.map((session) =>
          session.id === activeSessionId
            ? {
                ...session,
                updatedAt: nowLabel,
                messages: introMessage,
              }
            : session,
        ),
      );
    }
    message.success("已启动自进化流程。", 1.2);
  };

  const onCreateSession = () => {
    const nextIndex = chatSessions.length + 1;
    const newSessionId = `session-${Date.now()}`;
    const newSession: ChatSession = {
      id: newSessionId,
      title: `新会话 ${nextIndex}`,
      updatedAt: "刚刚",
      messages: [],
    };
    setChatSessions((prev) => [...prev, newSession]);
    setActiveSessionId(newSessionId);
    setPrompt("");
  };

  const onCloseSession = (sessionId: string) => {
    if (chatSessions.length <= 1) {
      message.info("至少保留一个会话标签。", 1);
      return;
    }
    const nextSessions = chatSessions.filter((item) => item.id !== sessionId);
    setChatSessions(nextSessions);
    if (activeSessionId === sessionId) {
      setActiveSessionId(nextSessions[0].id);
    }
  };

  const renderKnowledgeBaseButton = (extraClassName = "") => (
    <Dropdown
      trigger={["click"]}
      placement="topLeft"
      overlayClassName="self-evolution-chatlike-dropdown"
      menu={{
        items: knowledgeBaseMenuItems,
        selectable: true,
        selectedKeys: selectedKb ? [selectedKb] : [],
        onClick: ({ key }) => {
          setSelectedKb(key);
        },
      }}
    >
      <button
        type="button"
        className={`self-evolution-chatlike-tool ${extraClassName}`.trim()}
      >
        <DatabaseOutlined />
        <span>{selectedKnowledgeBase}</span>
        <DownOutlined className="self-evolution-chatlike-select-caret" />
      </button>
    </Dropdown>
  );

  const renderModeButton = (extraClassName = "") => (
    <Dropdown
      trigger={["click"]}
      placement="topLeft"
      overlayClassName="self-evolution-chatlike-dropdown"
      menu={{
        items: modeMenuItems,
        selectable: true,
        selectedKeys: [mode],
        onClick: ({ key }) => {
          setMode(key as EvolutionMode);
        },
      }}
    >
      <button
        type="button"
        className={`self-evolution-chatlike-tool ${extraClassName}`.trim()}
      >
        <MessageOutlined />
        <span>{modeLabel}</span>
        <DownOutlined className="self-evolution-chatlike-select-caret" />
      </button>
    </Dropdown>
  );

  const renderKnowledgeAndModeTools = () => (
    <div className="self-evolution-chatlike-tools">
      {renderKnowledgeBaseButton()}
      {renderModeButton()}
    </div>
  );

  const renderSendButton = () => (
    <button
      type="button"
      onClick={onSend}
      disabled={isSendDisabled}
      className={`self-evolution-chatlike-send-button${isSendDisabled ? " disabled" : ""}`}
      aria-label="发送"
    >
      <SendIcon />
    </button>
  );

  const renderMenuToggleButton = (extraClassName = "") => {
    if (!toggleMenu) {
      return null;
    }
    return (
      <button
        type="button"
        className={`self-evolution-menu-toggle-inline ${extraClassName}`.trim()}
        onClick={toggleMenu}
        aria-label={isMenuCollapsed ? "显示菜单" : "收起菜单"}
        title={isMenuCollapsed ? "显示菜单" : "收起菜单"}
      >
        {isMenuCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
      </button>
    );
  };

  const renderDatasetPreview = () => (
    <section className="self-evolution-dataset-preview" aria-label="数据集数据展示">
      <div className="self-evolution-dataset-cases-head">
        <Text>数据集明细（虚拟表格，适配大数据量）</Text>
        <Text>{`当前展示 ${evalCaseRows.length} / 共 ${evalSetPreviewData.total_nums} 条`}</Text>
      </div>

      <Table<EvalCaseRow>
        className="self-evolution-dataset-table"
        size="small"
        rowKey="key"
        columns={evalCaseColumns}
        dataSource={evalCaseRows}
        pagination={false}
        virtual
        scroll={{ x: 2200, y: 360 }}
      />
    </section>
  );

  const renderPxSingleCategoryPie = (categoryMetric: PxCategoryMetricAverage) => {
    const chartSize = 220;
    const center = chartSize / 2;
    const radius = 74;
    const strokeWidth = 34;
    const circumference = 2 * Math.PI * radius;
    const metricValues = pxMetricMeta.map((metric) => ({
      ...metric,
      value: clampScore(categoryMetric.metrics[metric.key]),
    }));
    const valueSum = metricValues.reduce((acc, item) => acc + item.value, 0);
    const normalized = metricValues.map((item) => ({
      ...item,
      ratio: valueSum > 0 ? item.value / valueSum : 1 / metricValues.length,
    }));
    let cumulativeOffset = 0;

    return (
      <div className="self-evolution-px-chart-wrap" aria-label="单分类指标饼图">
        <svg className="self-evolution-px-pie-chart" viewBox={`0 0 ${chartSize} ${chartSize}`} role="img">
          <title>{`${categoryMetric.category} 指标分布`}</title>
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#ecf2fb"
            strokeWidth={strokeWidth}
          />
          <g transform={`rotate(-90 ${center} ${center})`}>
            {normalized.map((item) => {
              const dashLength = item.ratio * circumference;
              const currentOffset = cumulativeOffset;
              cumulativeOffset += dashLength;
              return (
                <circle
                  key={item.key}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                  strokeDashoffset={-currentOffset}
                />
              );
            })}
          </g>
          <text x={center} y={center - 4} textAnchor="middle" className="self-evolution-px-pie-center-title">
            {categoryMetric.category}
          </text>
          <text x={center} y={center + 20} textAnchor="middle" className="self-evolution-px-pie-center-value">
            {`${categoryMetric.caseCount} 条`}
          </text>
        </svg>
      </div>
    );
  };

  const renderPxMultiCategoryLine = (categoryMetrics: PxCategoryMetricAverage[]) => {
    const width = 640;
    const height = 280;
    const padding = { top: 18, right: 24, bottom: 46, left: 44 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const categoryCount = categoryMetrics.length;
    const yToPx = (value: number) => padding.top + (1 - clampScore(value)) * chartHeight;
    const xToPx = (index: number) =>
      padding.left + (categoryCount <= 1 ? chartWidth / 2 : (index / (categoryCount - 1)) * chartWidth);
    const axisTicks = [0, 0.25, 0.5, 0.75, 1];

    return (
      <div className="self-evolution-px-chart-wrap" aria-label="多分类指标折线图">
        <svg className="self-evolution-px-line-chart" viewBox={`0 0 ${width} ${height}`} role="img">
          <title>问题分类指标均值折线图</title>
          {axisTicks.map((tick) => {
            const y = yToPx(tick);
            return (
              <g key={tick}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  className="self-evolution-px-grid-line"
                />
                <text x={padding.left - 8} y={y + 4} textAnchor="end" className="self-evolution-px-axis-label">
                  {tick.toFixed(2)}
                </text>
              </g>
            );
          })}

          <line
            x1={padding.left}
            y1={padding.top + chartHeight}
            x2={width - padding.right}
            y2={padding.top + chartHeight}
            className="self-evolution-px-axis-line"
          />

          {pxMetricMeta.map((metric) => {
            const pointValues = categoryMetrics.map((item, index) => ({
              x: xToPx(index),
              y: yToPx(item.metrics[metric.key]),
              value: item.metrics[metric.key],
            }));
            const points = pointValues.map((point) => `${point.x},${point.y}`).join(" ");
            return (
              <g key={metric.key}>
                <polyline
                  points={points}
                  fill="none"
                  stroke={metric.color}
                  strokeWidth={2.4}
                  className="self-evolution-px-series-line"
                />
                {pointValues.map((point, index) => (
                  <circle
                    key={`${metric.key}-${categoryMetrics[index].category}`}
                    cx={point.x}
                    cy={point.y}
                    r={3.8}
                    fill={metric.color}
                  >
                    <title>{`${metric.label} ${categoryMetrics[index].category}: ${formatPercent(point.value)}`}</title>
                  </circle>
                ))}
              </g>
            );
          })}

          {categoryMetrics.map((item, index) => {
            const x = xToPx(index);
            return (
              <text
                key={item.category}
                x={x}
                y={height - 16}
                textAnchor="middle"
                className="self-evolution-px-axis-label"
              >
                {item.category}
              </text>
            );
          })}
        </svg>
      </div>
    );
  };

  const renderPxReportPreview = () => (
    <section className="self-evolution-px-report" aria-label="评测报告指标展示">
      <div className="self-evolution-px-report-head">
        <Text>按问题类别聚合四项指标均值</Text>
        <Text>{`样本数 ${pxReportCaseMetrics.length}，分类数 ${pxCategoryMetricAverages.length}`}</Text>
      </div>

      {pxCategoryMetricAverages.length === 0 ? (
        <Paragraph className="self-evolution-px-empty">当前报告无可用指标数据。</Paragraph>
      ) : isSinglePxCategory ? (
        <div className="self-evolution-px-panel">
          {renderPxSingleCategoryPie(pxCategoryMetricAverages[0])}
          <div className="self-evolution-px-legend">
            {pxMetricMeta.map((metric) => (
              <div key={metric.key} className="self-evolution-px-legend-item">
                <span className="self-evolution-px-legend-dot" style={{ backgroundColor: metric.color }} />
                <span className="self-evolution-px-legend-label">{metric.label}</span>
                <span className="self-evolution-px-legend-value">
                  {formatPercent(pxCategoryMetricAverages[0].metrics[metric.key])}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="self-evolution-px-panel is-line">
          {renderPxMultiCategoryLine(pxCategoryMetricAverages)}
          <div className="self-evolution-px-legend is-compact">
            {pxMetricMeta.map((metric) => (
              <div key={metric.key} className="self-evolution-px-legend-item">
                <span className="self-evolution-px-legend-dot" style={{ backgroundColor: metric.color }} />
                <span className="self-evolution-px-legend-label">{metric.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );

  const renderAnalysisReportPreview = () => (
    <section className="self-evolution-analysis-report" aria-label="分析报告展示">
      <div className="self-evolution-analysis-head">
        <Text>CH 分析报告（Markdown）</Text>
      </div>
      <div className="self-evolution-analysis-body">
        <div className="self-evolution-analysis-markdown">
          <MarkdownViewer>{analysisReportMarkdown}</MarkdownViewer>
        </div>
      </div>
    </section>
  );

  const renderCodeOptimizeDiffPreview = () => {
    const renderTreeNodes = (nodes: DiffFileTreeNode[], depth = 0): ReactNode[] =>
      nodes.map((node) => {
        if (node.nodeType === "dir") {
          return (
            <div key={`dir-${node.path}`}>
              <div
                className="self-evolution-diff-tree-node is-dir"
                style={{ paddingLeft: `${depth * 14 + 8}px` }}
              >
                <span className="self-evolution-diff-tree-icon">▾</span>
                <span className="self-evolution-diff-tree-text">{node.name}</span>
              </div>
              {renderTreeNodes(node.children, depth + 1)}
            </div>
          );
        }

        const isActive = node.fileId === activeDiffFile?.id;
        return (
          <button
            key={`file-${node.path}-${node.fileId}`}
            type="button"
            className={`self-evolution-diff-tree-node is-file${isActive ? " is-active" : ""}`}
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
            onClick={() => node.fileId && setActiveDiffFileId(node.fileId)}
          >
            <span className="self-evolution-diff-tree-icon">•</span>
            <span className="self-evolution-diff-tree-text">{node.name}</span>
          </button>
        );
      });

    if (!activeDiffFile) {
      return (
        <section className="self-evolution-optimize-report" aria-label="代码优化 Diff 展示">
          <div className="self-evolution-optimize-head">
            <Text>CH 代码优化结果（Unified Diff）</Text>
          </div>
          <Paragraph className="self-evolution-px-empty">当前没有可展示的变更文件。</Paragraph>
        </section>
      );
    }

    const allLineCount = parsedDiffFiles.reduce((total, file) => total + file.lines.length, 0);
    return (
      <section className="self-evolution-optimize-report" aria-label="代码优化 Diff 展示">
        <div className="self-evolution-optimize-head">
          <Text>CH 代码优化结果（Unified Diff）</Text>
          <Text>{`文件 ${parsedDiffFiles.length} 个，总代码行 ${allLineCount} 行`}</Text>
        </div>
        <div className="self-evolution-optimize-layout">
          <aside className="self-evolution-optimize-tree" aria-label="变更文件结构">
            <div className="self-evolution-optimize-tree-head">文件结构</div>
            <div className="self-evolution-optimize-tree-body">{renderTreeNodes(diffFileTree)}</div>
          </aside>
          <div className="self-evolution-optimize-viewer" aria-label="变更代码内容">
            <div className="self-evolution-optimize-file-head">
              <Text className="self-evolution-optimize-file-path">{activeDiffFile.displayPath}</Text>
              <Text className="self-evolution-optimize-file-stat">
                {`+${activeDiffFile.additions} / -${activeDiffFile.deletions}`}
              </Text>
            </div>
            <div className="self-evolution-optimize-body">
              <pre className="self-evolution-optimize-diff">
                {activeDiffFile.lines.map((line, index) => {
                  const lineType = getDiffLineType(line);
                  return (
                    <div key={`diff-line-${activeDiffFile.id}-${index}`} className={`self-evolution-diff-line is-${lineType}`}>
                      <span className="self-evolution-diff-line-no">{index + 1}</span>
                      <span className="self-evolution-diff-line-code">{line || " "}</span>
                    </div>
                  );
                })}
              </pre>
            </div>
          </div>
        </div>
      </section>
    );
  };

  if (isWorkbenchVisible) {
    return (
      <div className="self-evolution-session-page">
        <div className="self-evolution-workbench">
          <section className="self-evolution-workflow-panel" aria-label="执行步骤">
            <div className="self-evolution-workflow-head">
              <div className="self-evolution-workflow-head-top">
                {renderMenuToggleButton()}
                <Title level={3}>自进化执行编排</Title>
              </div>
              <Paragraph>当前聚焦：{activeStepText}</Paragraph>
            </div>

            <div className="self-evolution-step-list">
              <div className="self-evolution-step-scroll">
                {workflowSteps.map((step, index) => (
                  <article
                    key={step.id}
                    className={`self-evolution-step-card is-${step.status}`}
                    style={{ animationDelay: `${index * 70}ms` }}
                  >
                    <div className="self-evolution-step-main">
                      <div className="self-evolution-step-title-row">
                        <Text className="self-evolution-step-title">{step.title}</Text>
                        <span className={`self-evolution-step-status is-${step.status}`}>
                          {step.status === "done" && <CheckCircleFilled />}
                          {step.status === "running" && <ClockCircleFilled />}
                          {step.status === "pending" && <FileTextOutlined />}
                          <span>
                            {step.status === "running"
                              ? "进行中"
                              : step.status === "done"
                                ? "已完成"
                                : "待执行"}
                          </span>
                        </span>
                      </div>
                      <Paragraph className="self-evolution-step-desc">{step.desc}</Paragraph>
                      {step.id === "dataset" && (
                        <Collapse
                          className="self-evolution-dataset-collapse"
                          bordered={false}
                          items={[
                            {
                              key: "dataset-preview",
                              label: `查看数据集数据（${evalCaseRows.length}/${evalSetPreviewData.total_nums}）`,
                              children: renderDatasetPreview(),
                            },
                          ]}
                        />
                      )}
                      {step.id === "px-report" && (
                        <Collapse
                          className="self-evolution-dataset-collapse self-evolution-px-collapse"
                          bordered={false}
                          items={[
                            {
                              key: "px-report-preview",
                              label:
                                pxCategoryMetricAverages.length === 0
                                  ? "查看评测图表（暂无有效数据）"
                                  : isSinglePxCategory
                                    ? "查看评测图表（单分类饼图）"
                                    : "查看评测图表（多分类折线图）",
                              children: renderPxReportPreview(),
                            },
                          ]}
                        />
                      )}
                      {step.id === "analysis" && (
                        <Collapse
                          className="self-evolution-dataset-collapse self-evolution-analysis-collapse"
                          bordered={false}
                          items={[
                            {
                              key: "analysis-report-preview",
                              label: "查看分析报告（Markdown）",
                              children: renderAnalysisReportPreview(),
                            },
                          ]}
                        />
                      )}
                      {step.id === "code-optimize" && (
                        <Collapse
                          className="self-evolution-dataset-collapse self-evolution-optimize-collapse"
                          bordered={false}
                          items={[
                            {
                              key: "code-optimize-diff-preview",
                              label: "查看代码变更（Unified Diff）",
                              children: renderCodeOptimizeDiffPreview(),
                            },
                          ]}
                        />
                      )}
                    </div>
                    <div className="self-evolution-step-actions">
                      {step.actions.map((action) => (
                        <button
                          key={action.key}
                          type="button"
                          className="self-evolution-step-action"
                          onClick={() =>
                            message.info(`「${step.title}」${action.label} 已加入待联调`, 1)
                          }
                        >
                          {action.icon}
                          <span>{action.label}</span>
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="self-evolution-chat-panel" aria-label="历史会话窗口">
            <div className="self-evolution-chat-head">
              <Title level={4}>历史会话</Title>
              <Text className="self-evolution-chat-head-hint">
                顶部标签支持切换历史会话，点击 + 可新建会话
              </Text>
            </div>

            <div className="self-evolution-history-tabs" aria-label="历史会话标签栏">
              <div className="self-evolution-history-tabs-scroll">
                {chatSessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    className={`self-evolution-history-tab${
                      session.id === activeSessionId ? " is-active" : ""
                    }`}
                    onClick={() => setActiveSessionId(session.id)}
                    title={`${session.title} · ${session.updatedAt}`}
                  >
                    <span className="self-evolution-history-tab-icon">
                      <MessageOutlined />
                    </span>
                    <span className="self-evolution-history-tab-label">{session.title}</span>
                    <span
                      className="self-evolution-history-tab-close"
                      onClick={(event) => {
                        event.stopPropagation();
                        onCloseSession(session.id);
                      }}
                    >
                      <CloseOutlined />
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="self-evolution-history-tab-create"
                onClick={onCreateSession}
                title="新建会话"
              >
                <PlusOutlined />
              </button>
            </div>

            <div className="self-evolution-chat-stream" aria-live="polite" aria-label="会话消息流">
              {activeMessages.length > 0 ? (
                activeMessages.map((item) => (
                  <article key={item.id} className={`self-evolution-bubble is-${item.role}`}>
                    <Paragraph>{item.content}</Paragraph>
                    <Text>{item.time}</Text>
                  </article>
                ))
              ) : (
                <Paragraph className="self-evolution-chat-empty">
                  当前会话暂无消息，请在底部输入指令开始。
                </Paragraph>
              )}
            </div>

            <div className="self-evolution-chat-composer">
              <Input.TextArea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                autoSize={{ minRows: 2, maxRows: 4 }}
                className="self-evolution-chatlike-input"
                placeholder="继续输入指令，例如：请先扩展数据集样本，再进入评测阶段。"
                aria-label="继续输入自进化指令"
                onPressEnter={(event) => {
                  if (event.shiftKey) {
                    return;
                  }
                  event.preventDefault();
                  if (prompt.trim()) {
                    onSend();
                  }
                }}
              />

              <div className="self-evolution-chat-composer-footer">
                <div className="self-evolution-chat-composer-left">
                  {renderKnowledgeAndModeTools()}
                </div>

                <div className="self-evolution-chatlike-actions">
                  <Text className="self-evolution-chatlike-helper">
                    第一步：生成数据集（进行中）
                  </Text>
                  {renderSendButton()}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="self-evolution-chatlike-page admin-page">
      <header className="self-evolution-chatlike-top">
        {renderMenuToggleButton("self-evolution-menu-toggle-global")}
        <Tag color="blue" className="self-evolution-chatlike-tag">
          单线程会话
        </Tag>
      </header>

      <section className="self-evolution-chatlike-hero">
        <Title level={1} className="self-evolution-chatlike-title">
          下午好，有什么我能帮你的吗？
        </Title>
        <Paragraph className="self-evolution-chatlike-subtitle">
          在这里发起自进化任务。提问前请先选择知识库。
        </Paragraph>
      </section>

      <section className="self-evolution-chatlike-launchpad" aria-label="初始化配置">
        <div className="self-evolution-chatlike-launch-controls">
          {renderKnowledgeBaseButton("is-launch-control")}
          {renderModeButton("is-launch-control")}
          <button
            type="button"
            className="self-evolution-chatlike-start-button"
            onClick={onStartSession}
          >
            开始
          </button>
        </div>
      </section>
    </div>
  );
}
