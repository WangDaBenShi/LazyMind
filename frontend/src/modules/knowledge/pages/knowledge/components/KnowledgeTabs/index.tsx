import { Empty, Tabs, TabsProps } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import { KnowledgeBaseServiceApi } from "@/modules/knowledge/utils/request";
import {
  Doc,
  ParserConfig,
  ParserConfigTypeEnum,
  Segment,
} from "@/api/generated/knowledge-client";

import SegmentTab from "../SegmentTab";
import SummaryTab from "../SummaryTab";
import QaTab from "../QaTab";
import Rendering from "@/modules/knowledge/components/Rendering";
import "./index.scss";

const TAB_KEY_BY_PARSER_TYPE: Partial<Record<ParserConfigTypeEnum, string>> = {
  [ParserConfigTypeEnum.ParseTypeSplit]: "3",
  [ParserConfigTypeEnum.ParseTypeSummary]: "2",
  [ParserConfigTypeEnum.ParseTypeQa]: "4",
  [ParserConfigTypeEnum.ParseTypeImageCaption]: "5",
};

const FALLBACK_TAB_KEY_BY_GROUP: Record<string, string> = {
  lazyllm_root: "3",
  block: "3",
  line: "3",
  summary: "2",
  qa: "4",
  hybrid: "5",
};

const KnowledgeTabs = (props: {
  knowledgeDetail: Doc;
  onGetItemInfo?: (data: Segment) => void;
}) => {
  const { knowledgeDetail, onGetItemInfo } = props;
  const { t } = useTranslation();

  const [activeKey, setActiveKey] = useState("");
  const [parsers, setParsers] = useState<ParserConfig[]>([]);
  const [tabs, setTabs] = useState<TabsProps["items"]>([]);
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);

  const group = useMemo(() => {
    return searchParams.get("group_name") || "";
  }, [searchParams]);

  function getActiveKeyByGroup(configs: ParserConfig[], groupName: string) {
    if (!groupName) {
      return "";
    }

    const matchedParser = configs.find((parser) => parser.name === groupName);
    if (matchedParser?.type) {
      return TAB_KEY_BY_PARSER_TYPE[matchedParser.type] || "";
    }

    return FALLBACK_TAB_KEY_BY_GROUP[groupName] || "";
  }

  useEffect(() => {
    setLoading(true);
    KnowledgeBaseServiceApi()
      .datasetServiceGetDataset({ dataset: knowledgeDetail.dataset_id || "" })
      .then((res) => {
        const result = (res.data.parsers || []) as ParserConfig[];
        setParsers(result);
        const currentTabs = generateTabs(result);
        setTabs(currentTabs);
        const routeActiveKey = getActiveKeyByGroup(result, group);
        if (
          routeActiveKey &&
          currentTabs.some((tab) => tab.key === routeActiveKey)
        ) {
          setActiveKey(routeActiveKey);
        } else {
          setActiveKey(currentTabs.length > 0 ? currentTabs[0].key : "");
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [knowledgeDetail, group]);

  function generateTabs(configs: ParserConfig[]) {
    if (!configs || configs.length < 1) {
      return [];
    }
    const initTabs: TabsProps["items"] = [];
    configs.forEach((parser) => {
      switch (parser.type) {
        case ParserConfigTypeEnum.ParseTypeSplit:
          if (initTabs.some((tab) => tab.key === "3")) {
            break;
          }
          initTabs.push({
            label: t("knowledge.segmentDocument"),
            children: (
              <SegmentTab
                detail={knowledgeDetail}
                type={
                  group === "block" || group === "line" ? group : parser.name
                }
                names={
                  configs
                    .filter(
                      (config) =>
                        config.type === ParserConfigTypeEnum.ParseTypeSplit,
                    )
                    .map((config) => config.name) as string[]
                }
                editable={true}
                onGetItemInfo={onGetItemInfo}
              />
            ),
            key: "3",
            closable: false,
          });
          break;
        case ParserConfigTypeEnum.ParseTypeSummary:
          initTabs.push({
            label: t("knowledge.segmentSummary"),
            children: (
              <div className="summary-container">
                <SummaryTab
                  detail={knowledgeDetail}
                  type={
                    group === parser.name ? group : parser.name || "summary"
                  }
                />
              </div>
            ),
            key: "2",
            closable: false,
          });
          break;
        case ParserConfigTypeEnum.ParseTypeQa:
          initTabs.push({
            label: t("knowledge.segmentQa"),
            children: (
              <QaTab
                detail={knowledgeDetail}
                type={group === parser.name ? group : parser.name || "qa"}
              />
            ),
            key: "4",
            closable: false,
          });
          break;
        case ParserConfigTypeEnum.ParseTypeImageCaption:
          initTabs.push({
            label: t("knowledge.imageCaption"),
            children: (
              <SegmentTab
                detail={knowledgeDetail}
                names={[parser.name as string]}
                type={group === parser.name ? group : parser.name || "hybrid"}
                editable={false}
              />
            ),
            key: "5",
            closable: false,
          });
          break;
      }
    });
    return initTabs.sort((a, b) => {
      return String(a.key).localeCompare(String(b.key));
    });
  }

  function onChange(newActiveKey: string) {
    setActiveKey(newActiveKey);
  }

  return loading ? (
    <Rendering text={t("common.loading")} />
  ) : parsers.length < 1 ? (
    <Empty description={t("knowledge.noContent")} style={{ marginTop: 80 }} />
  ) : (
    <Tabs
      type="editable-card"
      className="card-container !h-full"
      hideAdd
      onChange={onChange}
      activeKey={activeKey}
      items={tabs}
    />
  );
};

export default KnowledgeTabs;
