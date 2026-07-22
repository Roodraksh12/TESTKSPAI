"use client";

import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiRequest } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/scrb/primitives";

type ResetRow = {
  id: string;
  name?: string;
  badgeId?: string;
  role?: string;
  requestedAt?: string;
};

export default function PasswordResetsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const caps = user?.capabilities || {};
  const canFulfill = Boolean(caps.canFulfillResets);

  const [resets, setResets] = useState<ResetRow[]>([]);
  const [error, setError] = useState("");
  const [tempShown, setTempShown] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const r = await apiRequest("/api/admin/password-resets?status=PENDING");
      setResets(r.requests || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reset queue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canFulfill) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, canFulfill]);

  if (!canFulfill || !caps.isPoliceIt) {
    return <Navigate to={caps.defaultHome || "/overview"} replace />;
  }

  const fulfill = async (id: string) => {
    try {
      const data = await apiRequest(`/api/admin/password-resets/${id}/fulfill`, {
        method: "POST",
        body: "{}",
      });
      if (data.tempPassword) setTempShown(data.tempPassword);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fulfill failed");
    }
  };

  return (
    <div className="flex h-full flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("admin.resetPageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.resetPageSubtitle")}</p>
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

      <section className="rounded-2xl border border-hairline bg-surface p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t("admin.resetQueue")}
        </h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : resets.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.noResets")}</p>
        ) : (
          <ul className="space-y-2">
            {resets.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-hairline px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">
                    {r.name} · {r.badgeId}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{r.role}</p>
                </div>
                <Button type="button" onClick={() => fulfill(r.id)}>
                  {t("admin.fulfill")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
