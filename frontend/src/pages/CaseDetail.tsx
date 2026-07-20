import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiRequest } from "@/api/client";
import { ShieldAlert } from "lucide-react";
import CaseDossierClient from "./CaseDossierClient";
import { useAuth } from "@/context/AuthContext";

export default function CaseDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [caseData, setCaseData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    apiRequest(`/api/cases/${id}`)
      .then((payload) => setCaseData(normalizeCase(payload.case)))
      .catch((err) => setError(err.message || "Failed to load case"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 border-2 border-hairline border-t-ink rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center p-6">
        <div className="text-center space-y-4 glass p-12 rounded-3xl">
          <ShieldAlert className="w-12 h-12 text-muted-foreground mx-auto" />
          <h2 className="text-2xl font-medium text-foreground tracking-tight">
            {error || "Case not found or access denied."}
          </h2>
        </div>
      </div>
    );
  }

  if (user?.role !== "SP" && caseData.stationId && user?.stationId && caseData.stationId !== user.stationId) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center p-6">
        <div className="text-center space-y-4 glass p-12 rounded-3xl">
          <ShieldAlert className="w-12 h-12 text-muted-foreground mx-auto" />
          <h2 className="text-2xl font-medium text-foreground tracking-tight">Case not found or access denied.</h2>
        </div>
      </div>
    );
  }

  return <CaseDossierClient caseData={caseData} />;
}

function normalizeCase(raw: any) {
  return {
    ...raw,
    station: raw.policeStations || raw.station,
    casePersons: (raw.casePersons || []).map((cp: any) => ({
      ...cp,
      person: cp.persons || cp.person,
      role: cp.role,
    })),
    matches: raw.caseMatches || raw.matches || [],
  };
}
