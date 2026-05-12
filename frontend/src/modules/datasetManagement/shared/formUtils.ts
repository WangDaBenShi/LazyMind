import type { DatasetCollectionFormValues, DatasetRecordFormValues } from "./types";

export function trimCollectionValues(
  values: DatasetCollectionFormValues,
): DatasetCollectionFormValues {
  return {
    ...values,
    name: values.name.trim(),
    description: values.description?.trim(),
    knowledgeBase: values.knowledgeBase?.trim() || "",
  };
}

export function trimRecordValues(values: DatasetRecordFormValues): DatasetRecordFormValues {
  return {
    ...values,
    query: values.query.trim(),
    reactChain: values.reactChain?.trim(),
    reference: values.reference?.trim(),
    answer: values.answer.trim(),
  };
}
