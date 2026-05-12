import type { DatasetRecordSource, DatasetRecordStatus } from "./types";

export const sourceMeta: Record<DatasetRecordSource, { color: string; labelKey: string }> = {
  upload: { color: "blue", labelKey: "datasetManagement.sourceUpload" },
  feedback: { color: "green", labelKey: "datasetManagement.sourceFeedback" },
  manual: { color: "gold", labelKey: "datasetManagement.sourceManual" },
};

export const statusMeta: Record<DatasetRecordStatus, { color: string; labelKey: string }> = {
  ready: { color: "success", labelKey: "datasetManagement.statusReady" },
  reviewing: { color: "processing", labelKey: "datasetManagement.statusReviewing" },
  needsReview: { color: "warning", labelKey: "datasetManagement.statusNeedsReview" },
};
