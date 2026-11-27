import { useEffect, useRef, useState } from "react";
import { message } from "antd";
import { isAxiosError } from "axios";
import { useTranslation } from "react-i18next";
import {
  Configuration, PersonalizationApiFactory, type PersonalizationSettingOpenAPIResponse,
} from "@/api/generated/core-client";
import { axiosInstance, BASE_URL, getLocalizedErrorMessage } from "@/components/request";
import { disableTool, enableTool, listToolAssets, notifyToolAvailabilityChanged } from "@/modules/memory/toolApi";

const toolNames = { vocabulary: "vocab_learn", edit: "memory" } as const;
const ids = ["vocabulary", "read", "edit"] as const;
type CapabilityID = typeof ids[number];
interface Setting {
  checked: boolean;
  available: boolean;
  readonly: boolean;
}
const unavailable: Setting = { checked: false, available: false, readonly: false };
const initialSettings = { vocabulary: unavailable, read: unavailable, edit: unavailable };
const api = PersonalizationApiFactory(new Configuration({ basePath: BASE_URL }), BASE_URL, axiosInstance);

function readEnabled(payload: PersonalizationSettingOpenAPIResponse | { data: PersonalizationSettingOpenAPIResponse }) {
  return ("data" in payload ? payload.data : payload).enabled;
}

export function useMemoryCapabilities(active: boolean) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(initialSettings);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState<CapabilityID | null>(null);
  const writeInFlight = useRef(false);
  const [rowError, setRowError] = useState<CapabilityID | null>(null);

  useEffect(() => {
    if (!active || writeInFlight.current) return;
    let current = true;
    setLoading(true);
    setLoadError(false);
    setRowError(null);
    void Promise.allSettled([
      api.apiCorePersonalizationSettingGet().then((response) => readEnabled(response.data)),
      listToolAssets({ silentError: true }),
    ]).then(([personalization, tools]) => {
      if (!current) return;
      const toolSetting = (id: keyof typeof toolNames): Setting => {
        const asset = tools.status === "fulfilled" && tools.value.find((item) => item.id === toolNames[id]);
        return asset ? {
          checked: Boolean(asset.isEnabled),
          available: asset.isAvailable !== false,
          readonly: Boolean(asset.readonly),
        } : unavailable;
      };
      setSettings({
        vocabulary: toolSetting("vocabulary"),
        read: personalization.status === "fulfilled"
          ? { checked: personalization.value, available: true, readonly: false } : unavailable,
        edit: toolSetting("edit"),
      });
      setLoadError(personalization.status === "rejected" || tools.status === "rejected");
      setLoading(false);
    });
    return () => { current = false; };
  }, [active, attempt]);

  const items = ids.map((id) => {
    const { checked, readonly } = settings[id];
    const dependsOnRead = id === "edit";
    const available = settings[id].available && (!dependsOnRead || settings.read.available);
    const readOff = dependsOnRead && !settings.read.checked;
    const effective = available && checked && !readOff;
    const suspended = available && checked && readOff;
    let statusKey = effective ? "common.enabled" : "common.disabled";
    if (suspended) statusKey = "settingsPage.memory.suspendedWithRead";
    if (!available) statusKey = "settingsPage.memory.unavailable";
    return {
      id, checked, effective, suspended, readonly, statusKey,
      disabled: loading || saving !== null || !available || readonly || readOff,
    };
  });

  const change = async (id: CapabilityID, enabled: boolean) => {
    if (writeInFlight.current || items.find((item) => item.id === id)?.disabled) return;
    const previous = settings[id];
    writeInFlight.current = true;
    setSaving(id);
    setRowError(null);
    setSettings((current) => ({ ...current, [id]: { ...previous, checked: enabled } }));
    try {
      let saved = enabled;
      if (id === "read") {
        const response = await api.apiCorePersonalizationSettingPut({ personalizationSettingOpenAPIRequest: { enabled } });
        saved = readEnabled(response.data);
        setSettings((current) => ({ ...current, read: { ...current.read, checked: saved } }));
      } else {
        const name = toolNames[id];
        if (enabled) await enableTool(name);
        else await disableTool(name);
        notifyToolAvailabilityChanged({ id: name, enabled });
      }
      message.success(t(saved ? "settingsPage.memory.enabledToast" : "settingsPage.memory.disabledToast"));
    } catch (error) {
      const denied = isAxiosError(error) && error.response?.status === 403;
      setSettings((current) => ({ ...current, [id]: { ...previous, readonly: previous.readonly || denied } }));
      setRowError(id);
      message.error(getLocalizedErrorMessage(error));
    } finally {
      writeInFlight.current = false;
      setSaving(null);
    }
  };

  return { items, loading, loadError, saving, rowError, change, retry: () => setAttempt((value) => value + 1) };
}

export type MemoryCapabilities = ReturnType<typeof useMemoryCapabilities>;
