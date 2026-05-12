import { Form, Input, Modal, Select } from "antd";
import type { FormInstance } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { knowledgeBaseOptions } from "../shared/mockData";
import type { DatasetCollectionFormValues } from "../shared/types";

interface DatasetLibraryModalProps {
  form: FormInstance<DatasetCollectionFormValues>;
  open: boolean;
  editing: boolean;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

export default function DatasetLibraryModal({
  form,
  open,
  editing,
  submitting,
  onCancel,
  onSubmit,
}: DatasetLibraryModalProps) {
  const { t } = useTranslation();
  const knowledgeBaseSelectOptions = useMemo(
    () => [
      { label: t("datasetManagement.noKnowledgeBase"), value: "" },
      ...knowledgeBaseOptions.map((value) => ({ label: value, value })),
    ],
    [t],
  );

  return (
    <Modal
      title={editing ? t("datasetManagement.editLibrary") : t("datasetManagement.newLibrary")}
      open={open}
      okText={editing ? t("common.save") : t("datasetManagement.createAndEnter")}
      confirmLoading={submitting}
      onOk={onSubmit}
      onCancel={onCancel}
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <Form.Item
          name="name"
          label={t("datasetManagement.fieldLibraryName")}
          rules={[
            { required: true, message: t("datasetManagement.validationLibraryNameRequired") },
            { max: 80, message: t("datasetManagement.validationLibraryNameMax") },
          ]}
        >
          <Input placeholder={t("datasetManagement.libraryNamePlaceholder")} />
        </Form.Item>
        <Form.Item
          name="description"
          label={t("datasetManagement.fieldLibraryDescription")}
          rules={[{ max: 300, message: t("datasetManagement.validationLibraryDescriptionMax") }]}
        >
          <Input.TextArea rows={3} showCount maxLength={300} />
        </Form.Item>
        <Form.Item name="knowledgeBase" label={t("datasetManagement.fieldKnowledgeBase")}>
          <Select options={knowledgeBaseSelectOptions} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
