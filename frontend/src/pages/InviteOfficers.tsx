"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { apiRequest } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/lib/i18n";
import { Button, Input } from "@/components/scrb/primitives";
import { toast } from "sonner";

type GeoOption = { id: string; name: string; districtName?: string; commandRangeName?: string };

function requiredGeoForRole(role: string): string[] {
  const r = (role || "").toUpperCase();
  if (["POLICE_IT", "DGP_IGP", "ADGP"].includes(r)) return [];
  if (r === "IGP") return ["commandRangeId"];
  if (r === "DIG") return ["districtIds"];
  if (["SP", "ADDL_SP_DCP", "ASP_ACP"].includes(r)) return ["districtId"];
  if (r === "DYSP") return ["districtId", "rangeId"];
  return ["stationId"];
}

export default function InviteOfficersPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const caps = user?.capabilities || {};
  const inviteable: string[] = caps.inviteableRanks || [];
  const canInvite = Boolean(caps.canInvite);
  const isIt = Boolean(caps.isPoliceIt);

  const [stations, setStations] = useState<GeoOption[]>([]);
  const [commandRanges, setCommandRanges] = useState<GeoOption[]>([]);
  const [districts, setDistricts] = useState<GeoOption[]>([]);
  const [subdivisions, setSubdivisions] = useState<GeoOption[]>([]);
  const [error, setError] = useState("");
  const [tempShown, setTempShown] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [badgeId, setBadgeId] = useState("");
  const [role, setRole] = useState(inviteable[0] || "");
  const [email, setEmail] = useState("");
  const [stationId, setStationId] = useState(user?.stationId || "");
  const [districtId, setDistrictId] = useState(user?.districtId || "");
  const [districtIds, setDistrictIds] = useState<string[]>([]);
  const [rangeId, setRangeId] = useState(user?.rangeId || "");
  const [commandRangeId, setCommandRangeId] = useState(user?.commandRangeId || "");
  const [submitting, setSubmitting] = useState(false);

  const geoFields = requiredGeoForRole(role);
  const selectClass = "mt-1 w-full rounded-xl border border-hairline bg-surface-2 px-3 py-2 text-sm";

  useEffect(() => {
    if (!canInvite) return;
    Promise.all([
      apiRequest("/api/admin/stations"),
      apiRequest("/api/admin/command-ranges"),
      apiRequest("/api/admin/districts"),
      apiRequest("/api/admin/subdivisions"),
    ])
      .then(([st, cr, dist, sub]) => {
        setStations(st.stations || []);
        setCommandRanges(cr.commandRanges || []);
        setDistricts(dist.districts || []);
        setSubdivisions(sub.subdivisions || []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [canInvite, user?.id]);

  useEffect(() => {
    if (inviteable.length && !inviteable.includes(role)) setRole(inviteable[0]);
  }, [inviteable, role]);

  useEffect(() => {
    if (!districtId) return;
    apiRequest(`/api/admin/subdivisions?districtId=${encodeURIComponent(districtId)}`)
      .then((p) => setSubdivisions(p.subdivisions || []))
      .catch(() => {});
  }, [districtId]);

  useEffect(() => {
    if (!commandRangeId || !isIt) return;
    apiRequest(`/api/admin/districts?commandRangeId=${encodeURIComponent(commandRangeId)}`)
      .then((p) => setDistricts(p.districts || []))
      .catch(() => {});
  }, [commandRangeId, isIt]);

  if (!canInvite) {
    return <Navigate to={caps.defaultHome || "/overview"} replace />;
  }

  const onInvite = async (e: FormEvent) => {
    e.preventDefault();
    for (const field of geoFields) {
      if (field === "districtIds" && districtIds.length === 0) {
        setError("Select at least one district for DIG");
        return;
      }
      if (field === "commandRangeId" && !commandRangeId) {
        setError("Select a command range");
        return;
      }
      if (field === "districtId" && !districtId) {
        setError("Select a district");
        return;
      }
      if (field === "rangeId" && !rangeId) {
        setError("Select a sub-division");
        return;
      }
      if (field === "stationId" && !stationId) {
        setError("Select a station");
        return;
      }
    }
    if (!email.trim() || !email.includes("@")) {
      setError("Email is required — invite credentials are sent there");
      return;
    }
    setSubmitting(true);
    setError("");
    setTempShown(null);
    try {
      const data = await apiRequest("/api/admin/invitations", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          badgeId: badgeId.trim().toUpperCase(),
          role,
          email: email.trim(),
          stationId: geoFields.includes("stationId") ? stationId || null : null,
          districtId: geoFields.includes("districtId") || geoFields.includes("rangeId")
            ? districtId || null
            : geoFields.includes("districtIds")
              ? districtIds[0] || null
              : null,
          districtIds: geoFields.includes("districtIds") ? districtIds : null,
          rangeId: geoFields.includes("rangeId") ? rangeId || null : null,
          commandRangeId: geoFields.includes("commandRangeId") ? commandRangeId || null : null,
        }),
      });
      const invitedName = name.trim();
      if (data.tempPassword) setTempShown(data.tempPassword);
      setName("");
      setBadgeId("");
      setEmail("");
      toast.success(`${invitedName} has been invited successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setSubmitting(false);
    }
  };

  const title = useMemo(() => t("admin.invitePageTitle"), [t]);

  return (
    <div className="flex h-full flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.invitePageSubtitle")}</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {tempShown && (
        <div className="rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-sm">
          <p className="font-medium">{t("admin.tempPasswordOnce")}</p>
          <p className="font-mono mt-1 text-base tracking-wide">{tempShown}</p>
          <button type="button" className="text-xs underline mt-2" onClick={() => setTempShown(null)}>
            Dismiss
          </button>
        </div>
      )}

      <section className="rounded-2xl border border-hairline bg-surface p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("admin.invite")}</h2>
        <form onSubmit={onInvite} className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs text-muted-foreground">{t("admin.name")}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("admin.badgeId")}</label>
            <Input value={badgeId} onChange={(e) => setBadgeId(e.target.value)} required className="mt-1 uppercase" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("admin.rank")}</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className={selectClass}>
              {inviteable.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("admin.email")}</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1" placeholder="officer@ksp.gov.in" />
          </div>

          {geoFields.includes("commandRangeId") && (
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Command range (IGP)</label>
              <select value={commandRangeId} onChange={(e) => setCommandRangeId(e.target.value)} required className={selectClass}>
                <option value="">Select command range</option>
                {commandRanges.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {geoFields.includes("districtIds") && (
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Districts (DIG — multi-select)</label>
              <select
                multiple
                value={districtIds}
                onChange={(e) => setDistrictIds(Array.from(e.target.selectedOptions).map((o) => o.value))}
                required
                className={`${selectClass} min-h-[96px]`}
              >
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}{d.commandRangeName ? ` · ${d.commandRangeName}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {geoFields.includes("districtId") && (
            <div className={geoFields.includes("rangeId") ? "" : "sm:col-span-2"}>
              <label className="text-xs text-muted-foreground">District</label>
              <select value={districtId} onChange={(e) => { setDistrictId(e.target.value); setRangeId(""); }} required className={selectClass}>
                <option value="">Select district</option>
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          {geoFields.includes("rangeId") && (
            <div>
              <label className="text-xs text-muted-foreground">Sub-division (DySP)</label>
              <select value={rangeId} onChange={(e) => setRangeId(e.target.value)} required className={selectClass}>
                <option value="">Select sub-division</option>
                {subdivisions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {geoFields.includes("stationId") && (
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">{t("admin.station")}</label>
              <select value={stationId} onChange={(e) => setStationId(e.target.value)} required className={selectClass}>
                <option value="">Select station</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.districtName ? ` · ${s.districtName}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="sm:col-span-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "…" : t("admin.sendInvite")}
            </Button>
            <p className="mt-2 text-[11px] text-muted-foreground">{t("admin.emailHint")}</p>
          </div>
        </form>
      </section>
    </div>
  );
}
