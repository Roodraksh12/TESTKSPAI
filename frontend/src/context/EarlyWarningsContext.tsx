import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { apiRequest } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import type { ForecastAxis } from "@/components/scrb/trend-charts";

export type EarlyWarningNotification = {
  id: string;
  type: "HOTSPOT";
  stationId: string;
  stationName: string;
  zoneLabel: string;
  riskScore: number;
  reason: string;
  action: string;
  latitude: number;
  longitude: number;
  crimeType: string;
  severity: "MEDIUM" | "HIGH" | "CRITICAL";
  status: "ACTIVE" | "RESOLVED";
  evidence: {
    currentWindowDays?: number;
    baselineWindowDays?: number;
    currentCount?: number;
    baselineWeekly?: number;
    growthRatio?: number | null;
    concentration?: number;
    latestReportedAt?: string;
  };
  firstDetectedAt: string;
  lastDetectedAt: string;
  expiresAt?: string | null;
  isRead: boolean;
  readAt?: string | null;
};

type WarningPayload = {
  warnings: EarlyWarningNotification[];
  unreadCount: number;
  forecast: { axes: ForecastAxis[]; baseline: number };
  pollAfterSeconds: number;
};

type EarlyWarningsValue = WarningPayload & {
  enabled: boolean;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
};

const EMPTY_PAYLOAD: WarningPayload = {
  warnings: [],
  unreadCount: 0,
  forecast: { axes: [], baseline: 50 },
  pollAfterSeconds: 20,
};

const EarlyWarningsContext = createContext<EarlyWarningsValue | null>(null);

export function EarlyWarningsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const enabled = Boolean(
    user &&
      !user.capabilities?.isPoliceIt &&
      user.capabilities?.nav?.earlyWarnings !== false
  );
  const [payload, setPayload] = useState<WarningPayload>(EMPTY_PAYLOAD);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const knownIdsRef = useRef<Set<string> | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || document.visibilityState === "hidden") return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const next = (await apiRequest("/api/early-warnings", {
        fresh: true,
        signal: controller.signal,
      })) as WarningPayload;
      const warningIds = new Set((next.warnings || []).map((warning) => warning.id));
      if (knownIdsRef.current) {
        const freshUrgent = (next.warnings || []).find(
          (warning) =>
            !knownIdsRef.current?.has(warning.id) &&
            !warning.isRead &&
            (warning.severity === "HIGH" || warning.severity === "CRITICAL")
        );
        if (freshUrgent) {
          toast.warning(`New ${freshUrgent.severity.toLowerCase()} hotspot warning`, {
            description: freshUrgent.zoneLabel,
          });
        }
      }
      knownIdsRef.current = warningIds;
      setPayload({
        warnings: next.warnings || [],
        unreadCount: next.unreadCount || 0,
        forecast: next.forecast || { axes: [], baseline: 50 },
        pollAfterSeconds: next.pollAfterSeconds || 20,
      });
      setError(null);
      setLastUpdated(new Date());
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setError(err?.message || "Unable to load early warnings");
      }
    } finally {
      if (controllerRef.current === controller) {
        setLoading(false);
      }
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setPayload(EMPTY_PAYLOAD);
      setLoading(false);
      knownIdsRef.current = null;
      return;
    }
    setLoading(true);
    void refresh();
    const poll = window.setInterval(
      () => void refresh(),
      Math.max(10, payload.pollAfterSeconds) * 1000
    );
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisibility);
      controllerRef.current?.abort();
    };
  }, [enabled, payload.pollAfterSeconds, refresh]);

  const markRead = useCallback(
    async (id: string) => {
      const target = payload.warnings.find((warning) => warning.id === id);
      if (!target || target.isRead) return;
      setPayload((current) => ({
        ...current,
        unreadCount: Math.max(0, current.unreadCount - 1),
        warnings: current.warnings.map((warning) =>
          warning.id === id
            ? { ...warning, isRead: true, readAt: new Date().toISOString() }
            : warning
        ),
      }));
      try {
        await apiRequest(`/api/early-warnings/${id}/read`, { method: "POST" });
      } catch (err) {
        await refresh();
        throw err;
      }
    },
    [payload.warnings, refresh]
  );

  const markAllRead = useCallback(async () => {
    const readAt = new Date().toISOString();
    setPayload((current) => ({
      ...current,
      unreadCount: 0,
      warnings: current.warnings.map((warning) => ({
        ...warning,
        isRead: true,
        readAt,
      })),
    }));
    try {
      await apiRequest("/api/early-warnings/read-all", { method: "POST" });
    } catch (err) {
      await refresh();
      throw err;
    }
  }, [refresh]);

  const value = useMemo(
    () => ({
      ...payload,
      enabled,
      loading,
      error,
      lastUpdated,
      refresh,
      markRead,
      markAllRead,
    }),
    [payload, enabled, loading, error, lastUpdated, refresh, markRead, markAllRead]
  );

  return (
    <EarlyWarningsContext.Provider value={value}>
      {children}
    </EarlyWarningsContext.Provider>
  );
}

export function useEarlyWarnings() {
  const value = useContext(EarlyWarningsContext);
  if (!value) {
    throw new Error("useEarlyWarnings must be used inside EarlyWarningsProvider");
  }
  return value;
}
