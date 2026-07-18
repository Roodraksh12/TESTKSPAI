import { useEffect, useState } from "react";
import { apiRequest } from "@/api/client";
import { DashboardClient } from "./DashboardClient";

export default function Dashboard() {
  const [totalCases, setTotalCases] = useState(0);
  const [clearanceRate, setClearanceRate] = useState(0);
  const [alertCount, setAlertCount] = useState(0);
  const [recentCases, setRecentCases] = useState<
    { id: string; firNumber: string; crimeType: string; status: string; reportedDate: string }[]
  >([]);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiRequest("/api/dashboard")
      .then((payload) => {
        if (cancelled) return;
        setTotalCases(payload.stats?.totalCases ?? 0);
        setClearanceRate(payload.stats?.clearanceRate ?? 0);
        setAlertCount(payload.stats?.highRiskAlerts ?? 0);
        setRecentCases(
          (payload.recentCases || []).map((c: any) => ({
            id: c.id,
            firNumber: c.firNumber,
            crimeType: c.crimeType,
            status: c.status,
            reportedDate: c.reportedDate,
          }))
        );
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DashboardClient
      totalCases={totalCases}
      clearanceRate={clearanceRate}
      alertCount={alertCount}
      recentCases={recentCases}
      statsLoading={statsLoading}
    />
  );
}
