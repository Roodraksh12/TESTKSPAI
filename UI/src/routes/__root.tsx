import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div className="scrb-bg" />
      <div className="glass-strong max-w-md rounded-3xl px-10 py-12 text-center">
        <p className="text-mono text-xs tracking-widest text-amber uppercase">Error 404</p>
        <h1 className="text-display mt-3 text-4xl">Page not found</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This record isn't in the system, or you don't have clearance to view it.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-2xl bg-amber px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:brightness-110"
        >
          Return to sign in
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div className="scrb-bg" />
      <div className="glass-strong max-w-md rounded-3xl px-10 py-12 text-center">
        <h1 className="text-display text-2xl">Something interrupted this session</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The workspace couldn't load. Try again or return to the sign-in screen.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-2xl bg-amber px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:brightness-110"
          >
            Try again
          </button>
          <a
            href="/"
            className="glass rounded-2xl px-5 py-2.5 text-sm font-medium text-foreground transition hover:brightness-110"
          >
            Sign in
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "SCRB Sahayak — Karnataka Police Investigation Copilot" },
      {
        name: "description",
        content:
          "SCRB Sahayak is a secure AI investigation copilot for the Karnataka State Crime Records Bureau — case intelligence, entity linkage, hotspots and FIR analysis in one calm, official workspace.",
      },
      { name: "author", content: "Karnataka State Crime Records Bureau" },
      { name: "theme-color", content: "#eef1f5" },
      { property: "og:title", content: "SCRB Sahayak — Investigation Copilot" },
      {
        property: "og:description",
        content: "AI-powered case intelligence for Karnataka State Crime Records Bureau.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap",
      },

    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <div className="scrb-bg" />
      <Outlet />
    </QueryClientProvider>
  );
}
