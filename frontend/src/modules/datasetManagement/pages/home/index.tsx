import { useMemo, useState } from "react";
import { Button, Card, Empty, Form, Input, Space, Table, Tooltip, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { EditOutlined, FolderAddOutlined, SearchOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import DatasetLibraryModal from "../../components/DatasetLibraryModal";
import { trimCollectionValues } from "../../shared/formUtils";
import { initialCollections, initialRecords } from "../../shared/mockData";
import type { DatasetCollection, DatasetCollectionFormValues } from "../../shared/types";
import "../../index.scss";

const { Paragraph, Text } = Typography;

export default function DatasetHomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [libraryForm] = Form.useForm<DatasetCollectionFormValues>();

  const [collections, setCollections] = useState<DatasetCollection[]>(initialCollections);
  const [libraryKeyword, setLibraryKeyword] = useState("");
  const [libraryModalOpen, setLibraryModalOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<DatasetCollection | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const collectionRecordCounts = useMemo(() => {
    return initialRecords.reduce<Record<string, number>>((acc, record) => {
      acc[record.datasetId] = (acc[record.datasetId] ?? 0) + 1;
      return acc;
    }, {});
  }, []);

  const filteredCollections = useMemo(() => {
    const normalizedKeyword = libraryKeyword.trim().toLowerCase();
    return collections.filter((collection) => {
      if (!normalizedKeyword) return true;
      return [collection.name, collection.description, collection.knowledgeBase]
        .join(" ")
        .toLowerCase()
        .includes(normalizedKeyword);
    });
  }, [collections, libraryKeyword]);

  const openCreateLibraryModal = () => {
    setEditingCollection(null);
    libraryForm.setFieldsValue({
      name: "",
      description: "",
      knowledgeBase: "",
    });
    setLibraryModalOpen(true);
  };

  const openEditLibraryModal = (collection: DatasetCollection) => {
    setEditingCollection(collection);
    libraryForm.setFieldsValue(collection);
    setLibraryModalOpen(true);
  };

  const handleLibrarySubmit = async () => {
    try {
      const values = trimCollectionValues(await libraryForm.validateFields());
      setSubmitting(true);
      window.setTimeout(() => {
        if (editingCollection) {
          setCollections((prev) =>
            prev.map((collection) =>
              collection.id === editingCollection.id
                ? { ...collection, ...values, updatedAt: "2026-05-12 10:00" }
                : collection,
            ),
          );
          message.success(t("datasetManagement.libraryUpdated"));
        } else {
          const newCollection: DatasetCollection = {
            id: `lib-${Math.floor(1000 + Math.random() * 9000)}`,
            ...values,
            description: values.description || "",
            knowledgeBase: values.knowledgeBase || "",
            owner: t("datasetManagement.currentUser"),
            updatedAt: "2026-05-12 10:00",
          };
          setCollections((prev) => [newCollection, ...prev]);
          message.success(t("datasetManagement.libraryCreated"));
          navigate(`/datasets/${newCollection.id}`, { state: { collection: newCollection } });
        }
        setSubmitting(false);
        setLibraryModalOpen(false);
      }, 360);
    } catch {
      setSubmitting(false);
    }
  };

  const libraryColumns: ColumnsType<DatasetCollection> = [
    {
      title: t("datasetManagement.columnLibraryName"),
      dataIndex: "name",
      width: 300,
      render: (value: string, collection) => (
        <div className="dataset-library-name">
          <Button type="link" onClick={() => navigate(`/datasets/${collection.id}`)}>
            {value}
          </Button>
          <Text type="secondary" ellipsis={{ tooltip: collection.description }}>
            {collection.description || t("datasetManagement.noDescription")}
          </Text>
        </div>
      ),
    },
    {
      title: t("datasetManagement.columnKnowledgeBase"),
      dataIndex: "knowledgeBase",
      width: 180,
      render: (value: string) => value || t("datasetManagement.noKnowledgeBase"),
    },
    {
      title: t("datasetManagement.columnSampleCount"),
      dataIndex: "id",
      width: 130,
      render: (id: string) => collectionRecordCounts[id] ?? 0,
    },
    {
      title: t("datasetManagement.columnUpdatedAt"),
      dataIndex: "updatedAt",
      width: 170,
    },
    {
      title: t("common.actions"),
      key: "actions",
      fixed: "right",
      width: 150,
      render: (_, collection) => (
        <Space size={4}>
          <Button type="link" onClick={() => navigate(`/datasets/${collection.id}`)}>
            {t("datasetManagement.enterLibrary")}
          </Button>
          <Tooltip title={t("common.edit")}>
            <Button
              type="text"
              icon={<EditOutlined />}
              aria-label={t("datasetManagement.editLibraryAria", { name: collection.name })}
              onClick={() => openEditLibraryModal(collection)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div className="dataset-management-page">
      <div className="dataset-management-toolbar">
        <div>
          <h2>{t("datasetManagement.title")}</h2>
          <Paragraph className="dataset-management-subtitle">
            {t("datasetManagement.subtitle")}
          </Paragraph>
        </div>
        <Button type="primary" icon={<FolderAddOutlined />} onClick={openCreateLibraryModal}>
          {t("datasetManagement.newLibrary")}
        </Button>
      </div>

      <div className="dataset-management-library-layout">
        <Card className="dataset-management-list-card">
          <div className="dataset-management-list-header">
            <span className="dataset-management-list-title">{t("datasetManagement.allLibraries")}</span>
            <Input
              allowClear
              className="dataset-management-search"
              prefix={<SearchOutlined />}
              placeholder={t("datasetManagement.librarySearchPlaceholder")}
              value={libraryKeyword}
              onChange={(event) => setLibraryKeyword(event.target.value)}
            />
          </div>
          <Table
            rowKey="id"
            className="dataset-management-table"
            columns={libraryColumns}
            dataSource={filteredCollections}
            pagination={{ pageSize: 10, showSizeChanger: true }}
            scroll={{ x: 930, y: "calc(100vh - 300px)" }}
            locale={{
              emptyText: (
                <Empty
                  description={t("datasetManagement.emptyLibraries")}
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              ),
            }}
          />
        </Card>
      </div>

      <DatasetLibraryModal
        form={libraryForm}
        open={libraryModalOpen}
        editing={Boolean(editingCollection)}
        submitting={submitting}
        onSubmit={handleLibrarySubmit}
        onCancel={() => setLibraryModalOpen(false)}
      />
    </div>
  );
}
