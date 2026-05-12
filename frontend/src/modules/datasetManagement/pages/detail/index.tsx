import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Segmented,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadProps } from "antd";
import {
  ArrowLeftOutlined,
  CloudDownloadOutlined,
  EditOutlined,
  EyeOutlined,
  InboxOutlined,
  PlusOutlined,
  SearchOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import DatasetLibraryModal from "../../components/DatasetLibraryModal";
import DatasetRecordDrawer from "../../components/DatasetRecordDrawer";
import { trimCollectionValues, trimRecordValues } from "../../shared/formUtils";
import { sourceMeta, statusMeta } from "../../shared/meta";
import { initialCollections, initialRecords, knowledgeBaseOptions } from "../../shared/mockData";
import type {
  DatasetCollection,
  DatasetCollectionFormValues,
  DatasetRecord,
  DatasetRecordFormValues,
  DatasetRecordSource,
  DatasetRecordStatus,
  FeedbackImportFormValues,
} from "../../shared/types";
import "../../index.scss";

const { Paragraph, Text } = Typography;

interface DetailLocationState {
  collection?: DatasetCollection;
}

export default function DatasetDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { datasetId = "" } = useParams();
  const location = useLocation();
  const locationState = location.state as DetailLocationState | null;
  const [libraryForm] = Form.useForm<DatasetCollectionFormValues>();
  const [recordForm] = Form.useForm<DatasetRecordFormValues>();
  const [feedbackForm] = Form.useForm<FeedbackImportFormValues>();

  const seededCollections = useMemo(() => {
    if (!locationState?.collection) return initialCollections;
    const exists = initialCollections.some((collection) => collection.id === locationState.collection?.id);
    return exists ? initialCollections : [locationState.collection, ...initialCollections];
  }, [locationState?.collection]);

  const [collections, setCollections] = useState<DatasetCollection[]>(seededCollections);
  const [records, setRecords] = useState<DatasetRecord[]>(initialRecords);
  const [sourceFilter, setSourceFilter] = useState<DatasetRecordSource | "all">("all");
  const [keyword, setKeyword] = useState("");
  const [libraryModalOpen, setLibraryModalOpen] = useState(false);
  const [recordDrawerOpen, setRecordDrawerOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DatasetRecord | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedDataset = useMemo(
    () => collections.find((collection) => collection.id === datasetId) ?? null,
    [collections, datasetId],
  );

  const selectedRecords = useMemo(
    () => records.filter((record) => record.datasetId === datasetId),
    [records, datasetId],
  );

  const filteredRecords = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return selectedRecords.filter((record) => {
      const sourceMatched = sourceFilter === "all" || record.source === sourceFilter;
      if (!sourceMatched) return false;
      if (!normalizedKeyword) return true;
      return [record.query, record.answer, record.reference, record.owner]
        .join(" ")
        .toLowerCase()
        .includes(normalizedKeyword);
    });
  }, [keyword, selectedRecords, sourceFilter]);

  const openEditLibraryModal = () => {
    if (!selectedDataset) return;
    libraryForm.setFieldsValue(selectedDataset);
    setLibraryModalOpen(true);
  };

  const handleLibrarySubmit = async () => {
    if (!selectedDataset) return;
    try {
      const values = trimCollectionValues(await libraryForm.validateFields());
      setSubmitting(true);
      window.setTimeout(() => {
        setCollections((prev) =>
          prev.map((collection) =>
            collection.id === selectedDataset.id
              ? { ...collection, ...values, updatedAt: "2026-05-12 10:00" }
              : collection,
          ),
        );
        setSubmitting(false);
        setLibraryModalOpen(false);
        message.success(t("datasetManagement.libraryUpdated"));
      }, 360);
    } catch {
      setSubmitting(false);
    }
  };

  const openCreateDrawer = () => {
    if (!selectedDataset) return;
    setEditingRecord(null);
    recordForm.setFieldsValue({
      query: "",
      reactChain: "",
      reference: "",
      answer: "",
      source: "manual",
      status: "ready",
    });
    setRecordDrawerOpen(true);
  };

  const openEditDrawer = (record: DatasetRecord) => {
    setEditingRecord(record);
    recordForm.setFieldsValue(record);
    setRecordDrawerOpen(true);
  };

  const handleRecordSubmit = async () => {
    if (!selectedDataset) return;
    try {
      const values = trimRecordValues(await recordForm.validateFields());
      setSubmitting(true);
      window.setTimeout(() => {
        if (editingRecord) {
          setRecords((prev) =>
            prev.map((record) =>
              record.id === editingRecord.id
                ? { ...record, ...values, updatedAt: "2026-05-12 10:00" }
                : record,
            ),
          );
          message.success(t("datasetManagement.recordUpdated"));
        } else {
          setRecords((prev) => [
            {
              id: `ds-${Math.floor(1000 + Math.random() * 9000)}`,
              datasetId: selectedDataset.id,
              ...values,
              reactChain: values.reactChain || "",
              reference: values.reference || "",
              updatedAt: "2026-05-12 10:00",
              owner: t("datasetManagement.currentUser"),
            },
            ...prev,
          ]);
          message.success(t("datasetManagement.recordCreated"));
        }
        setCollections((prev) =>
          prev.map((collection) =>
            collection.id === selectedDataset.id
              ? { ...collection, updatedAt: "2026-05-12 10:00" }
              : collection,
          ),
        );
        setSubmitting(false);
        setRecordDrawerOpen(false);
      }, 360);
    } catch {
      setSubmitting(false);
    }
  };

  const uploadProps: UploadProps = {
    accept: ".csv,.json,.jsonl,.xlsx",
    maxCount: 1,
    beforeUpload: (file) => {
      const allowedSuffixes = [".csv", ".json", ".jsonl", ".xlsx"];
      const isAllowed = allowedSuffixes.some((suffix) => file.name.toLowerCase().endsWith(suffix));
      const isSmallEnough = file.size / 1024 / 1024 <= 20;
      if (!isAllowed) {
        message.error(t("datasetManagement.uploadTypeError"));
        return Upload.LIST_IGNORE;
      }
      if (!isSmallEnough) {
        message.error(t("datasetManagement.uploadSizeError"));
        return Upload.LIST_IGNORE;
      }
      return false;
    },
  };

  const handleUploadConfirm = () => {
    if (!selectedDataset) return;
    setSubmitting(true);
    window.setTimeout(() => {
      setRecords((prev) => [
        {
          id: `ds-${Math.floor(1000 + Math.random() * 9000)}`,
          datasetId: selectedDataset.id,
          query: t("datasetManagement.mockUploadQuery"),
          reactChain: t("datasetManagement.mockUploadChain"),
          reference: selectedDataset.knowledgeBase,
          answer: t("datasetManagement.mockUploadAnswer"),
          source: "upload",
          status: "reviewing",
          updatedAt: "2026-05-12 10:00",
          owner: "mock-dataset.csv",
        },
        ...prev,
      ]);
      setSubmitting(false);
      setUploadModalOpen(false);
      message.success(t("datasetManagement.uploadQueued"));
    }, 360);
  };

  const handleFeedbackImport = async () => {
    if (!selectedDataset) return;
    try {
      await feedbackForm.validateFields();
      setSubmitting(true);
      window.setTimeout(() => {
        setRecords((prev) => [
          {
            id: `ds-${Math.floor(1000 + Math.random() * 9000)}`,
            datasetId: selectedDataset.id,
            query: t("datasetManagement.mockFeedbackQuery"),
            reactChain: t("datasetManagement.mockFeedbackChain"),
            reference: selectedDataset.knowledgeBase,
            answer: t("datasetManagement.mockFeedbackAnswer"),
            source: "feedback",
            status: "ready",
            updatedAt: "2026-05-12 10:00",
            owner: t("datasetManagement.feedbackImport"),
          },
          ...prev,
        ]);
        setSubmitting(false);
        setFeedbackModalOpen(false);
        message.success(t("datasetManagement.feedbackImportQueued"));
      }, 360);
    } catch {
      setSubmitting(false);
    }
  };

  const recordColumns: ColumnsType<DatasetRecord> = [
    {
      title: t("datasetManagement.columnQuery"),
      dataIndex: "query",
      width: 260,
      render: (value: string, record) => (
        <div className="dataset-record-title">
          <Button
            type="link"
            onClick={() => navigate(`/datasets/${datasetId}/documents/${record.id}`)}
          >
            {value}
          </Button>
          <Text type="secondary">{record.id}</Text>
        </div>
      ),
    },
    {
      title: t("datasetManagement.columnChain"),
      dataIndex: "reactChain",
      width: 240,
      ellipsis: true,
    },
    {
      title: t("datasetManagement.columnReference"),
      dataIndex: "reference",
      width: 220,
      ellipsis: true,
    },
    {
      title: t("datasetManagement.columnAnswer"),
      dataIndex: "answer",
      width: 280,
      ellipsis: true,
    },
    {
      title: t("datasetManagement.columnSource"),
      dataIndex: "source",
      width: 120,
      render: (source: DatasetRecordSource) => (
        <Tag color={sourceMeta[source].color}>{t(sourceMeta[source].labelKey)}</Tag>
      ),
    },
    {
      title: t("datasetManagement.columnStatus"),
      dataIndex: "status",
      width: 120,
      render: (status: DatasetRecordStatus) => (
        <Tag color={statusMeta[status].color}>{t(statusMeta[status].labelKey)}</Tag>
      ),
    },
    {
      title: t("datasetManagement.columnUpdatedAt"),
      dataIndex: "updatedAt",
      width: 160,
    },
    {
      title: t("common.actions"),
      key: "actions",
      fixed: "right",
      width: 130,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title={t("datasetManagement.viewDocument")}>
            <Button
              type="text"
              icon={<EyeOutlined />}
              aria-label={t("datasetManagement.viewDocumentAria", { query: record.query })}
              onClick={() => navigate(`/datasets/${datasetId}/documents/${record.id}`)}
            />
          </Tooltip>
          <Tooltip title={t("common.edit")}>
            <Button
              type="text"
              icon={<EditOutlined />}
              aria-label={t("datasetManagement.editRecordAria", { query: record.query })}
              onClick={() => openEditDrawer(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  if (!selectedDataset) {
    return (
      <div className="dataset-management-page">
        <Card className="dataset-management-list-card">
          <Empty description={t("datasetManagement.libraryNotFound")}>
            <Button type="primary" onClick={() => navigate("/datasets")}>
              {t("datasetManagement.backToLibraries")}
            </Button>
          </Empty>
        </Card>
      </div>
    );
  }

  return (
    <div className="dataset-management-page">
      <div className="dataset-management-toolbar">
        <div>
          <h2>{selectedDataset.name}</h2>
          <Paragraph className="dataset-management-subtitle">
            {selectedDataset.description}
          </Paragraph>
        </div>
        <Space wrap>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/datasets")}>
            {t("datasetManagement.backToLibraries")}
          </Button>
          <Button icon={<UploadOutlined />} onClick={() => setUploadModalOpen(true)}>
            {t("datasetManagement.upload")}
          </Button>
          <Button icon={<CloudDownloadOutlined />} onClick={() => setFeedbackModalOpen(true)}>
            {t("datasetManagement.feedbackImport")}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
            {t("datasetManagement.newRecord")}
          </Button>
        </Space>
      </div>

      <section className="dataset-management-detail-band" aria-label={t("datasetManagement.libraryOverview")}>
        <div className="dataset-management-detail-meta">
          <span>
            {t("datasetManagement.fieldKnowledgeBase")}:{" "}
            {selectedDataset.knowledgeBase || t("datasetManagement.noKnowledgeBase")}
          </span>
          <span>{t("datasetManagement.columnSampleCount")}: {selectedRecords.length}</span>
        </div>
        <Button icon={<EditOutlined />} onClick={openEditLibraryModal}>
          {t("datasetManagement.editLibrary")}
        </Button>
      </section>

      <Card className="dataset-management-list-card">
        <div className="dataset-management-list-header">
          <Segmented<DatasetRecordSource | "all">
            value={sourceFilter}
            onChange={setSourceFilter}
            options={[
              { label: t("datasetManagement.allSources"), value: "all" },
              { label: t("datasetManagement.sourceUpload"), value: "upload" },
              { label: t("datasetManagement.sourceFeedback"), value: "feedback" },
              { label: t("datasetManagement.sourceManual"), value: "manual" },
            ]}
          />
          <Input
            allowClear
            className="dataset-management-search"
            prefix={<SearchOutlined />}
            placeholder={t("datasetManagement.searchPlaceholder")}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>
        <Table
          rowKey="id"
          className="dataset-management-table"
          columns={recordColumns}
          dataSource={filteredRecords}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          scroll={{ x: 1530, y: "calc(100vh - 360px)" }}
          locale={{
            emptyText: (
              <Empty
                description={t("datasetManagement.emptyRecords")}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ),
          }}
        />
      </Card>

      <DatasetLibraryModal
        form={libraryForm}
        open={libraryModalOpen}
        editing
        submitting={submitting}
        onSubmit={handleLibrarySubmit}
        onCancel={() => setLibraryModalOpen(false)}
      />

      <DatasetRecordDrawer
        form={recordForm}
        open={recordDrawerOpen}
        editing={Boolean(editingRecord)}
        submitting={submitting}
        libraryName={selectedDataset.name}
        onSubmit={handleRecordSubmit}
        onCancel={() => setRecordDrawerOpen(false)}
      />

      <Modal
        title={t("datasetManagement.uploadDataset")}
        open={uploadModalOpen}
        okText={t("datasetManagement.startUpload")}
        confirmLoading={submitting}
        onOk={handleUploadConfirm}
        onCancel={() => setUploadModalOpen(false)}
      >
        <Alert
          type="info"
          showIcon
          className="dataset-management-modal-alert"
          message={t("datasetManagement.uploadHintWithLibrary", { name: selectedDataset.name })}
        />
        <Upload.Dragger {...uploadProps}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">{t("datasetManagement.uploadDragText")}</p>
          <p className="ant-upload-hint">{t("datasetManagement.uploadSupportText")}</p>
        </Upload.Dragger>
      </Modal>

      <Modal
        title={t("datasetManagement.feedbackImportTitle")}
        open={feedbackModalOpen}
        okText={t("datasetManagement.startFeedbackImport")}
        confirmLoading={submitting}
        onOk={handleFeedbackImport}
        onCancel={() => setFeedbackModalOpen(false)}
      >
        <Form
          form={feedbackForm}
          layout="vertical"
          initialValues={{
            knowledgeBase: selectedDataset.knowledgeBase || knowledgeBaseOptions[0],
            timeRange: "30d",
            quality: "liked",
          }}
        >
          <Alert
            type="info"
            showIcon
            className="dataset-management-modal-alert"
            message={t("datasetManagement.feedbackHintWithLibrary", { name: selectedDataset.name })}
          />
          <Form.Item
            name="knowledgeBase"
            label={t("datasetManagement.fieldKnowledgeBase")}
            rules={[{ required: true, message: t("datasetManagement.validationKnowledgeBaseRequired") }]}
          >
            <Select options={knowledgeBaseOptions.map((value) => ({ label: value, value }))} />
          </Form.Item>
          <Form.Item name="timeRange" label={t("datasetManagement.fieldTimeRange")}>
            <Select
              options={[
                { label: t("datasetManagement.timeRange7d"), value: "7d" },
                { label: t("datasetManagement.timeRange30d"), value: "30d" },
                { label: t("datasetManagement.timeRange90d"), value: "90d" },
              ]}
            />
          </Form.Item>
          <Form.Item name="quality" label={t("datasetManagement.fieldQuality")}>
            <Select
              options={[
                { label: t("datasetManagement.qualityLiked"), value: "liked" },
                { label: t("datasetManagement.qualityRated"), value: "rated" },
                { label: t("datasetManagement.qualityAll"), value: "all" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
