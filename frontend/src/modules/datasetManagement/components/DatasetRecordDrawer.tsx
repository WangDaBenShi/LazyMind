import { Alert, Button, Drawer, Form, Input, Select, Space } from "antd";
import type { FormInstance } from "antd";
import { useTranslation } from "react-i18next";
import type { DatasetRecordFormValues } from "../shared/types";

interface DatasetRecordDrawerProps {
  form: FormInstance<DatasetRecordFormValues>;
  open: boolean;
  editing: boolean;
  submitting: boolean;
  libraryName: string;
  onCancel: () => void;
  onSubmit: () => void;
}

export default function DatasetRecordDrawer({
  form,
  open,
  editing,
  submitting,
  libraryName,
  onCancel,
  onSubmit,
}: DatasetRecordDrawerProps) {
  const { t } = useTranslation();

  return (
    <Drawer
      width={560}
      title={editing ? t("datasetManagement.editRecord") : t("datasetManagement.newRecord")}
      open={open}
      onClose={onCancel}
      extra={
        <Space>
          <Button onClick={onCancel}>{t("common.cancel")}</Button>
          <Button type="primary" loading={submitting} onClick={onSubmit}>
            {t("common.save")}
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <Alert
          type="info"
          showIcon
          className="dataset-management-modal-alert"
          message={t("datasetManagement.writeIntoLibrary", { name: libraryName })}
        />
        <Form.Item
          name="query"
          label={t("datasetManagement.fieldQuery")}
          rules={[
            { required: true, message: t("datasetManagement.validationQueryRequired") },
            { max: 500, message: t("datasetManagement.validationQueryMax") },
          ]}
        >
          <Input.TextArea rows={3} showCount maxLength={500} />
        </Form.Item>
        <Form.Item
          name="reactChain"
          label={t("datasetManagement.fieldReactChain")}
          rules={[{ max: 2000, message: t("datasetManagement.validationChainMax") }]}
        >
          <Input.TextArea rows={4} showCount maxLength={2000} />
        </Form.Item>
        <Form.Item
          name="reference"
          label={t("datasetManagement.fieldReference")}
          rules={[{ max: 2000, message: t("datasetManagement.validationReferenceMax") }]}
        >
          <Input.TextArea rows={3} showCount maxLength={2000} />
        </Form.Item>
        <Form.Item
          name="answer"
          label={t("datasetManagement.fieldAnswer")}
          rules={[
            { required: true, message: t("datasetManagement.validationAnswerRequired") },
            { max: 4000, message: t("datasetManagement.validationAnswerMax") },
          ]}
        >
          <Input.TextArea rows={5} showCount maxLength={4000} />
        </Form.Item>
        <div className="dataset-management-form-grid">
          <Form.Item
            name="source"
            label={t("datasetManagement.fieldSource")}
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { label: t("datasetManagement.sourceUpload"), value: "upload" },
                { label: t("datasetManagement.sourceFeedback"), value: "feedback" },
                { label: t("datasetManagement.sourceManual"), value: "manual" },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="status"
            label={t("datasetManagement.fieldStatus")}
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { label: t("datasetManagement.statusReady"), value: "ready" },
                { label: t("datasetManagement.statusReviewing"), value: "reviewing" },
                { label: t("datasetManagement.statusNeedsReview"), value: "needsReview" },
              ]}
            />
          </Form.Item>
        </div>
      </Form>
    </Drawer>
  );
}
