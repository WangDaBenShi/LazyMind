import type {
  ConfiguredModelSupplier, ListModelProviderGroupsOpenAPIResponse, ListUserModelProvidersOpenAPIResponse,
  UserModelProviderOpenAPIItem,
} from "@/api/generated/core-client";
import { modelProvidersApi, unwrapModelProviderData, withModelProviderJsonOptions } from "@/modules/modelProvider/api";

export type OverviewServiceCategory = "parsing" | "search" | "academic" | "translation";
export const previewSize = 3;

function externalCategory(provider: UserModelProviderOpenAPIItem): OverviewServiceCategory | undefined {
  switch (provider.category) {
    case "ocr": return "parsing";
    case "search":
    case "translation": return provider.category;
    case "datasource":
      // These are the data sources exposed in the academic service settings.
      if (["openalex", "sciverse"].includes(provider.name.trim().toLowerCase())) return "academic";
  }
}

function brandId(provider: UserModelProviderOpenAPIItem) {
  return provider.brand_key && provider.service_key ? provider.brand_key : provider.id;
}

async function configuredSuppliers(providers: UserModelProviderOpenAPIItem[], limit: number, signal: AbortSignal) {
  const candidates = providers.filter(provider => provider.category === "model");
  const configured = new Map<string, UserModelProviderOpenAPIItem>();
  for (const provider of candidates) {
    const brand = brandId(provider);
    if (provider.is_configured && !configured.has(brand)) configured.set(brand, provider);
  }

  // Older Core counts also include saved, unverified models and credentials.
  // Consult group metadata only when the batch has fewer verified brands than required.
  for (const provider of candidates) {
    if (configured.size >= limit) break;
    const brand = brandId(provider);
    if (configured.has(brand)) continue;
    const response = await modelProvidersApi.apiCoreModelProvidersModelProviderIdGroupsGet(
      { modelProviderId: provider.id }, withModelProviderJsonOptions({ signal, silentError: true }),
    ).catch(() => undefined);
    if (!response) {
      if (signal.aborted) break;
      continue;
    }
    const { groups } = unwrapModelProviderData<ListModelProviderGroupsOpenAPIResponse>(response.data);
    if (groups?.some(group => group.has_api_key || group.model_count > 0 || group.is_verified)) {
      configured.set(brand, provider);
    }
  }
  return Array.from(configured.values()).slice(0, limit);
}

export async function loadOverviewModelServices(
  supplierPreview: ConfiguredModelSupplier[] | undefined,
  supplierCount: number,
  signal: AbortSignal,
) {
  const response = await modelProvidersApi.apiCoreModelProvidersWithGroupsGet({}, withModelProviderJsonOptions({ signal, silentError: true }));
  const { providers = [] } = unwrapModelProviderData<ListUserModelProvidersOpenAPIResponse>(response.data);
  const suppliers = supplierPreview ?? await configuredSuppliers(providers, Math.min(supplierCount, previewSize), signal);
  const services = providers.flatMap(provider => {
    const category = externalCategory(provider);
    return provider.is_configured && category ? [{ id: provider.id, name: provider.name, category }] : [];
  });
  return { suppliers, services: services.slice(0, Math.max(0, previewSize - suppliers.length)) };
}
