import { Header, Sidebar } from "@/components/scrb/shell";
import { PageTransition } from "@/components/PageTransition";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { Outlet, useLocation } from "react-router-dom";
import { AiPill } from "@/components/scrb/ai-pill";
import { EarlyWarningsProvider } from "@/context/EarlyWarningsContext";

export default function ProtectedLayout() {
  const { pathname } = useLocation();
  // The Copilot page is already a full chat surface; a floating ask box on top
  // of it would just be a second input for the same thing.
  const isCopilot = pathname === "/dashboard";

  return (
    <EarlyWarningsProvider>
      <div className="flex h-screen overflow-hidden bg-background relative">
        <Sidebar />
        <div className="flex flex-1 flex-col min-w-0 relative">
          <Header />
          <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-7xl h-full pb-24">
              <PageTransition>
                <RouteErrorBoundary>
                  <Outlet />
                </RouteErrorBoundary>
              </PageTransition>
            </div>
          </main>
          {!isCopilot && <AiPill />}
        </div>
      </div>
    </EarlyWarningsProvider>
  );
}
