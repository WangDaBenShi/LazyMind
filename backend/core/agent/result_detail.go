package agent

import (
	"context"
	"fmt"
	"net/http"
	"strings"
)

type threadResultDetail struct {
	ThreadID        string           `json:"thread_id"`
	Kind            string           `json:"kind"`
	Report          map[string]any   `json:"report"`
	Summary         map[string]any   `json:"summary"`
	Cases           []map[string]any `json:"cases"`
	SelectedCase    map[string]any   `json:"selected_case,omitempty"`
	SourceArtifacts map[string]any   `json:"source_artifacts,omitempty"`
	MissingFields   []string         `json:"missing_fields,omitempty"`
}

func buildThreadResultDetail(_ context.Context, _ *http.Request, threadID, resultKind string, results any) (*threadResultDetail, error) {
	switch resultKind {
	case "eval-reports":
		return buildEvalResultDetail(threadID, results)
	case "abtests":
		return buildAbtestResultDetail(threadID, results)
	default:
		return nil, fmt.Errorf("unsupported result kind: %s", resultKind)
	}
}

func buildEvalResultDetail(threadID string, results any) (*threadResultDetail, error) {
	report, source := resultDetailPayload(results, "eval_report")
	cases := resultDetailCases(report, source)
	if len(cases) == 0 {
		return nil, fmt.Errorf("eval report case_details not found")
	}
	badCases := resultDetailEvalCases(cases)
	summary := map[string]any{
		"total_count":   len(cases),
		"badcase_count": len(badCases),
		"accuracy":      nestedNumberField(report, "metrics", "correct_rate"),
	}
	detail := &threadResultDetail{
		ThreadID: threadID,
		Kind:     "eval-reports",
		Report: map[string]any{
			"id":             stringField(report, "id", "report_id"),
			"dataset_ref":    stringField(report, "eval_dataset_ref", "dataset_ref"),
			"dataset_name":   stringField(report, "dataset_name", "eval_dataset_name"),
			"total_count":    len(cases),
			"missing_fields": []string{},
		},
		Summary:         summary,
		Cases:           badCases,
		SelectedCase:    firstMap(badCases, cases),
		SourceArtifacts: sourceArtifacts(report, source),
	}
	if len(detail.SelectedCase) == 0 {
		detail.SelectedCase = firstMap(cases)
	}
	if stringField(detail.Report, "dataset_name") == "" {
		detail.MissingFields = append(detail.MissingFields, "report.dataset_name")
	}
	return detail, nil
}

func buildAbtestResultDetail(threadID string, results any) (*threadResultDetail, error) {
	report, source := resultDetailPayload(results, "abtest_comparison")
	cases := resultDetailCases(report, source)
	if len(cases) == 0 {
		return nil, fmt.Errorf("abtest case_details not found")
	}
	displayCases := resultDetailChangedCases(cases)
	if len(displayCases) == 0 {
		displayCases = cases
	}
	summary := map[string]any{
		"total_count":   len(cases),
		"changed_count": len(resultDetailChangedCases(cases)),
		"accuracy":      nestedNumberField(report, "metrics", "candidate", "correct_rate"),
	}
	detail := &threadResultDetail{
		ThreadID: threadID,
		Kind:     "abtests",
		Report: map[string]any{
			"id":             stringField(report, "id", "abtest_id"),
			"dataset_ref":    stringField(report, "eval_dataset_ref", "dataset_ref"),
			"dataset_name":   stringField(report, "dataset_name", "eval_dataset_name"),
			"total_count":    len(cases),
			"missing_fields": []string{},
		},
		Summary:         summary,
		Cases:           displayCases,
		SelectedCase:    firstMap(displayCases, cases),
		SourceArtifacts: sourceArtifacts(report, source),
	}
	if len(detail.SelectedCase) == 0 {
		detail.SelectedCase = firstMap(cases)
	}
	if stringField(detail.Report, "dataset_name") == "" {
		detail.MissingFields = append(detail.MissingFields, "report.dataset_name")
	}
	return detail, nil
}

func resultDetailPayload(results any, expectedSchema string) (map[string]any, map[string]any) {
	for _, item := range sliceAny(results) {
		row := mapAny(item)
		if stringField(row, "schema") != expectedSchema {
			continue
		}
		return mapAny(row["data"]), row
	}
	return map[string]any{}, map[string]any{}
}

func resultDetailCases(report, source map[string]any) []map[string]any {
	if cases := caseDetailsList(report); len(cases) > 0 {
		return normalizeDetailCases(cases)
	}
	if cases := caseDetailsList(source); len(cases) > 0 {
		return normalizeDetailCases(cases)
	}
	return nil
}

func resultDetailEvalCases(rows []map[string]any) []map[string]any {
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		if !isBadCase(row) {
			continue
		}
		out = append(out, row)
	}
	return out
}

func resultDetailChangedCases(rows []map[string]any) []map[string]any {
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		if strings.TrimSpace(strings.ToLower(stringField(row, "outcome"))) == "unchanged" {
			continue
		}
		out = append(out, row)
	}
	return out
}

func caseDetailsList(value map[string]any) []any {
	if value == nil {
		return nil
	}
	if cases, ok := value["case_details"].([]any); ok {
		return cases
	}
	if data, ok := value["data"].(map[string]any); ok {
		if cases, ok := data["case_details"].([]any); ok {
			return cases
		}
	}
	return nil
}

func normalizeDetailCases(cases []any) []map[string]any {
	rows := make([]map[string]any, 0, len(cases))
	for _, item := range cases {
		row := mapAny(item)
		if len(row) == 0 {
			continue
		}
		row["trace_linked"] = stringField(row, "trace_id") != ""
		if _, ok := row["missing_fields"]; !ok {
			row["missing_fields"] = resultCaseMissingFields(row)
		}
		rows = append(rows, row)
	}
	return rows
}

func isBadCase(row map[string]any) bool {
	if strings.TrimSpace(strings.ToLower(stringField(row, "quality_label"))) != "good" {
		return true
	}
	if failure := strings.TrimSpace(strings.ToLower(stringField(row, "failure_type"))); failure != "" && failure != "none" {
		return true
	}
	return false
}

func sourceArtifacts(report, source map[string]any) map[string]any {
	out := map[string]any{}
	if v := stringField(source, "artifact_id"); v != "" {
		out["artifact_id"] = v
	}
	if v := stringField(source, "artifact_ref"); v != "" {
		out["artifact_ref"] = v
	}
	if v := stringField(report, "source_message_id"); v != "" {
		out["source_message_id"] = v
	}
	if v := stringField(report, "abtest_comparison_id"); v != "" {
		out["abtest_comparison_id"] = v
	}
	return out
}

func firstMap(groups ...[]map[string]any) map[string]any {
	for _, group := range groups {
		if len(group) > 0 {
			return group[0]
		}
	}
	return nil
}

func mapAny(value any) map[string]any {
	if value == nil {
		return map[string]any{}
	}
	if row, ok := value.(map[string]any); ok {
		return row
	}
	return map[string]any{}
}

func sliceAny(value any) []any {
	if rows, ok := value.([]any); ok {
		return rows
	}
	return nil
}

func stringField(value map[string]any, keys ...string) string {
	for _, key := range keys {
		if raw, ok := value[key]; ok {
			if text := strings.TrimSpace(fmt.Sprint(raw)); text != "" && text != "<nil>" {
				return text
			}
		}
	}
	return ""
}

func numberField(value map[string]any, keys ...string) any {
	for _, key := range keys {
		if raw, ok := value[key]; ok {
			if num, ok := numberFromAny(raw); ok {
				return num
			}
		}
	}
	return nil
}

func nestedNumberField(value map[string]any, keys ...string) any {
	var current any = value
	for _, key := range keys {
		row := mapAny(current)
		if len(row) == 0 {
			return nil
		}
		current = row[key]
	}
	if num, ok := numberFromAny(current); ok {
		return num
	}
	return nil
}

func resultCaseMissingFields(row map[string]any) []string {
	missing := []string{}
	for _, key := range []string{"question", "ground_truth", "rag_answer"} {
		if stringField(row, key) == "" {
			missing = append(missing, key)
		}
	}
	return missing
}
