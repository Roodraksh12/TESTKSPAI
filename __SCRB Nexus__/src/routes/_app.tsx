import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Dock, TopNav } from "@/components/scrb/shell";
import { useDemoSession } from "@/lib/scrb/session";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { session, hydrated } = useDemoSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (hydrated && !session) navigate({ to: "/" });
  }, [hydrated, session, navigate]);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="glass rounded-full px-4 py-2 text-xs text-muted-foreground">Loading workspace…</div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <TopNav />
      <main className="mx-auto max-w-[1400px] px-4 pt-24 pb-28 sm:px-6 lg:px-8">
        <Outlet />
      </main>
      <Dock />
    </div>
  );
}
