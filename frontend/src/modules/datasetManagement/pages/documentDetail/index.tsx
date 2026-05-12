import { Button, Card, Descriptions, Empty, Space, Tag, Typography } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { sourceMeta, statusMeta } from "../../shared/meta";
import { initialCollections, initialRecords } from "../../shared/mockData";
import "../../index.scss";

const { Paragraph, Text } = Typography;

export default function DatasetDocumentDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { datasetId = "", documentId = "" } = useParams();

  const dataset = initialCollections.find((collection) => collection.id === datasetId);
  const document = initialRecords.find(
    (record) => record.datasetId === datasetId && record.id === documentId,
  );

  if (!dataset || !document) {
    return (
      <div className="dataset-management-page">
        <Card className="dataset-management-list-card">
          <Empty description={t("datasetManagement.documentNotFound")}>
            <Button type="primary" onClick={() => navigate(datasetId ? `/datasets/${datasetId}` : "/datasets")}>
              {datasetId ? t("datasetManagement.backToDatasetDetail") : t("datasetManagement.backToLibraries")}
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
          <h2>{t("datasetManagement.documentDetailTitle")}</h2>
          <Paragraph className="dataset-management-subtitle">
            {dataset.name} / {document.id}
          </Paragraph>
        </div>
        <Space wrap>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/datasets/${datasetId}`)}>
            {t("datasetManagement.backToDatasetDetail")}
          </Button>
        </Space>
      </div>

      <Card className="dataset-management-document-card">
        <Descriptions column={2} bordered size="middle">
          <Descriptions.Item label={t("datasetManagement.columnLibraryName")} span={2}>
            {dataset.name}
          </Descriptions.Item>
          <Descriptions.Item label={t("datasetManagement.columnSource")}>
            <Tag color={sourceMeta[document.source].color}>
              {t(sourceMeta[document.source].labelKey)}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t("datasetManagement.columnStatus")}>
            <Tag color={statusMeta[document.status].color}>
              {t(statusMeta[document.status].labelKey)}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t("datasetManagement.columnUpdatedAt")}>
            {document.updatedAt}
          </Descriptions.Item>
          <Descriptions.Item label={t("datasetManagement.columnKnowledgeBase")}>
            {dataset.knowledgeBase || t("datasetManagement.noKnowledgeBase")}
          </Descriptions.Item>
        </Descriptions>

        <section className="dataset-management-document-section">
          <Text strong>{t("datasetManagement.fieldQuery")}</Text>
          <Paragraph>{document.query}</Paragraph>
        </section>
        <section className="dataset-management-document-section">
          <Text strong>{t("datasetManagement.fieldReactChain")}</Text>
          <Paragraph>{document.reactChain || t("datasetManagement.noContent")}</Paragraph>
        </section>
        <section className="dataset-management-document-section">
          <Text strong>{t("datasetManagement.fieldReference")}</Text>
          <Paragraph>{document.reference || t("datasetManagement.noContent")}</Paragraph>
        </section>
        <section className="dataset-management-document-section">
          <Text strong>{t("datasetManagement.fieldAnswer")}</Text>
          <Paragraph>{document.answer}</Paragraph>
        </section>
      </Card>
    </div>
  );
}
