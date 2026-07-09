import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Check, X, FileText, Users, Share2, Image as ImageIcon, GitBranch } from "lucide-react";
import { CASES } from "@/lib/scrb/mock";
import { GlassPanel, GlassPill, GlassButton, IconOrb, SectionLabel } from "@/components/scrb/primitives";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/cases/$caseId")({
  loader: ({ params }) => {
    const c = CASES.find((x) => x.id === params.caseId);
    if (!c) throw notFound();
    return c;
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.firNumber ?? "Case"} — SCRB Sahayak` }],
  }),
  notFoundComponent: () => (
    <GlassPanel strong className="p-8 text-center">
      <p className="text-display text-xl">Case not found</p>
      <p className="mt-2 text-sm text-muted-foreground">This FIR isn't in your accessible records.</p>
    </GlassPanel>
  ),
  component: CaseDossier,
});

const TABS = [
  { id: "overview", label: "Overview", icon: FileText },
  { id: "timeline", label: "Timeline", icon: GitBranch },
  { id: "connections", label: "Connections", icon: Share2 },
  { id: "evidence", label: "Evidence", icon: ImageIcon },
  { id: "matches", label: "Matches", icon: Users },
] as const;

function CaseDossier() {
  const c = Route.useLoaderData();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("overview");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/cases" className="glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> All cases
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <GlassPill tone={c.status === "Active" ? "teal" : "amber"}>{c.status}</GlassPill>
          <GlassPill tone="muted"><span className="text-mono">{c.firNumber}</span></GlassPill>
        </div>
      </div>

      <GlassPanel strong className="p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <SectionLabel>{c.station} · {c.location}</SectionLabel>
            <h1 className="text-display mt-1 text-3xl">{c.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{c.crimeType} · Reported {c.date}</p>
          </div>
          <div className="flex gap-2">
            <GlassButton variant="glass" size="md">Export dossier</GlassButton>
            <GlassButton variant="primary" size="md">Draft update</GlassButton>
          </div>
        </div>

        {/* Segmented tabs */}
        <div className="glass mt-6 inline-flex rounded-2xl p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition",
                tab === t.id ? "bg-muted text-foreground shadow-inner" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {tab === "overview" && <Overview c={c} />}
          {tab === "timeline" && <Timeline />}
          {tab === "connections" && <Connections />}
          {tab === "evidence" && <Evidence />}
          {tab === "matches" && <Matches />}
        </div>
      </GlassPanel>
    </div>
  );
}

function Overview({ c }: { c: (typeof CASES)[number] }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="glass rounded-3xl p-5 lg:col-span-2">
        <SectionLabel>Summary</SectionLabel>
        <p className="mt-2 text-sm leading-relaxed text-foreground">{c.summary}</p>
      </div>
      <div className="glass rounded-3xl p-5">
        <SectionLabel>Entities</SectionLabel>
        <ul className="mt-2 space-y-2">
          {c.entities.map((e) => (
            <li key={e} className="glass rounded-2xl px-3 py-2 text-mono text-xs">{e}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Timeline() {
  const items = [
    { t: "21:04", d: "14 Jun", label: "Incident reported at Trinity Circle" },
    { t: "22:18", d: "14 Jun", label: "Beat patrol arrives, CCTV requested" },
    { t: "09:40", d: "15 Jun", label: "CCTV retrieved — partial plate KA-05-MJ" },
    { t: "14:22", d: "15 Jun", label: "Suspect alias 'Chotu' matched to prior FIR" },
  ];
  return (
    <ol className="relative ml-4 space-y-4 border-l border-hairline pl-6">
      {items.map((i) => (
        <li key={i.t + i.d} className="relative">
          <span className="absolute -left-[30px] top-1.5 h-3 w-3 rounded-full bg-amber shadow-[0_0_0_4px_color-mix(in_oklab,var(--amber)_25%,transparent)]" />
          <div className="glass rounded-2xl p-4">
            <p className="text-mono text-[11px] text-muted-foreground">{i.d} · {i.t}</p>
            <p className="mt-1 text-sm">{i.label}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Connections() {
  return (
    <div className="glass rounded-3xl p-4">
      <p className="text-sm text-muted-foreground">Interactive graph available on the Network canvas.</p>
      <Link to="/network" className="mt-3 inline-flex">
        <GlassButton variant="glass" size="sm">Open network canvas</GlassButton>
      </Link>
    </div>
  );
}

function Evidence() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="glass rounded-3xl p-4">
          <div className="aspect-[4/5] rounded-2xl bg-gradient-to-br from-white/10 to-white/[0.02] p-4">
            <div className="h-full w-full rounded-xl border border-hairline bg-surface-2 p-3">
              <p className="text-mono text-[10px] text-muted-foreground">FIR ATTACHMENT #{i}</p>
              <div className="mt-2 space-y-1.5">
                {Array.from({ length: 8 }).map((_, k) => (
                  <div key={k} className="h-1.5 rounded bg-muted" style={{ width: `${60 + ((i * k) % 40)}%` }} />
                ))}
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Scanned statement · Page {i}</p>
        </div>
      ))}
    </div>
  );
}

function Matches() {
  const rows = [
    { name: "'Chotu' — alias", basis: "Suspect name match across FIR-2026-1039", conf: 87 },
    { name: "KA-05-MJ-••••", basis: "Partial plate CCTV correlation", conf: 92 },
    { name: "Trinity–HAL corridor", basis: "Location adjacency + time window", conf: 71 },
  ];
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.name} className="glass flex flex-wrap items-center gap-3 rounded-3xl p-4">
          <IconOrb tone="teal" size="sm"><Users className="h-3.5 w-3.5" /></IconOrb>
          <div className="min-w-0 flex-1">
            <p className="text-mono text-sm">{r.name}</p>
            <p className="text-xs text-muted-foreground">{r.basis}</p>
          </div>
          <div className="w-40">
            <div className="h-1.5 rounded-full bg-muted">
              <div className="h-full rounded-full bg-teal" style={{ width: `${r.conf}%` }} />
            </div>
            <p className="mt-1 text-right text-[10px] text-muted-foreground">{r.conf}% match</p>
          </div>
          <div className="flex gap-2">
            <button className="glass inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs hover:brightness-125">
              <Check className="h-3 w-3" /> Confirm
            </button>
            <button className="glass inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:brightness-125">
              <X className="h-3 w-3" /> Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
