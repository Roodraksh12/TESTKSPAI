import { createFileRoute } from "@tanstack/react-router";
import { ChatPanel } from "@/components/scrb/chat";
import { CaseLedger } from "@/components/scrb/case-ledger";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — SCRB Sahayak" },
      { name: "description", content: "Investigation copilot dashboard for open cases." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_0.6fr]">
      <ChatPanel />
      <CaseLedger />
    </div>
  );
}
