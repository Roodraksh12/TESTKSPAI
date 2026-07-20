import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiRequest } from "@/api/client";
import TacticalView from "./TacticalView";
import { useAuth } from "@/context/AuthContext";

export default function Tactical() {
  const { id } = useParams();
  const { user } = useAuth();
  const [caseData, setCaseData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    apiRequest(`/api/cases/${id}`)
      .then((payload) => {
        const raw = payload.case;
        setCaseData({
          ...raw,
          casePersons: (raw.casePersons || []).map((cp: any) => ({
            ...cp,
            person: cp.persons || cp.person,
          })),
          matches: raw.caseMatches || raw.matches || [],
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="p-8 text-center text-white bg-slate-900 h-screen">Loading tactical view...</div>;
  }

  if (!caseData || (user?.role !== "SP" && caseData.stationId !== user?.stationId)) {
    return <div className="p-8 text-center text-white bg-slate-900 h-screen">Access Denied.</div>;
  }

  return <TacticalView caseData={caseData} />;
}
