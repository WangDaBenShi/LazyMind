export type DatasetRecordSource = "upload" | "feedback" | "manual";
export type DatasetRecordStatus = "ready" | "reviewing" | "needsReview";

export interface DatasetCollection {
  id: string;
  name: string;
  description: string;
  knowledgeBase: string;
  owner: string;
  updatedAt: string;
}

export interface DatasetRecord {
  id: string;
  datasetId: string;
  query: string;
  reactChain: string;
  reference: string;
  answer: string;
  source: DatasetRecordSource;
  status: DatasetRecordStatus;
  updatedAt: string;
  owner: string;
}

export interface DatasetCollectionFormValues {
  name: string;
  description?: string;
  knowledgeBase?: string;
}

export interface DatasetRecordFormValues {
  query: string;
  reactChain?: string;
  reference?: string;
  answer: string;
  source: DatasetRecordSource;
  status: DatasetRecordStatus;
}

export interface FeedbackImportFormValues {
  knowledgeBase: string;
  timeRange: "7d" | "30d" | "90d";
  quality: "liked" | "rated" | "all";
}
