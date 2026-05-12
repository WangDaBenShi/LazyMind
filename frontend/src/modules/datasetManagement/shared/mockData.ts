import type { DatasetCollection, DatasetRecord } from "./types";

export const knowledgeBaseOptions = ["企业制度知识库", "售后工单知识库", "产品手册知识库"];

export const initialCollections: DatasetCollection[] = [
  {
    id: "lib-1001",
    name: "企业制度评测集",
    description: "用于回归验证福利、差旅、远程办公等制度类问答质量。",
    knowledgeBase: "企业制度知识库",
    owner: "运营团队",
    updatedAt: "2026-05-11 10:20",
  },
  {
    id: "lib-1002",
    name: "售后工单训练集",
    description: "沉淀设备维修、SLA 升级、区域服务流程的标准样本。",
    knowledgeBase: "售后工单知识库",
    owner: "qa-team",
    updatedAt: "2026-05-10 16:42",
  },
  {
    id: "lib-1003",
    name: "产品手册修订集",
    description: "人工维护高风险硬件操作样本，进入训练前需要审核。",
    knowledgeBase: "",
    owner: "管理员",
    updatedAt: "2026-05-07 18:45",
  },
];

export const initialRecords: DatasetRecord[] = [
  {
    id: "ds-1024",
    datasetId: "lib-1001",
    query: "员工异地办公是否可以申请交通补贴？",
    reactChain: "识别福利政策 -> 检索差旅与远程办公制度 -> 对齐适用条件",
    reference: "《员工差旅与远程办公管理办法》第 4.2 条",
    answer: "可以申请，但需满足跨城市通勤、主管审批和发票留存三个条件。",
    source: "feedback",
    status: "ready",
    updatedAt: "2026-05-09 15:30",
    owner: "运营回流",
  },
  {
    id: "ds-1025",
    datasetId: "lib-1002",
    query: "设备维修超过 48 小时没有响应时应该怎么升级？",
    reactChain: "定位售后 SLA -> 检索升级规则 -> 生成操作步骤",
    reference: "售后服务流程/SLA 升级规则",
    answer: "应在工单中选择紧急升级，并同步区域服务经理，系统会自动标记为 P1。",
    source: "upload",
    status: "reviewing",
    updatedAt: "2026-05-08 09:12",
    owner: "qa-team.csv",
  },
  {
    id: "ds-1026",
    datasetId: "lib-1003",
    query: "新款网关如何恢复出厂设置？",
    reactChain: "识别硬件型号 -> 查找重置章节 -> 核对按键时长",
    reference: "GX-9 网关用户手册/维护章节",
    answer: "长按 Reset 键 10 秒，状态灯变为橙色闪烁后松开，等待设备自动重启。",
    source: "manual",
    status: "needsReview",
    updatedAt: "2026-05-07 18:45",
    owner: "管理员",
  },
];
