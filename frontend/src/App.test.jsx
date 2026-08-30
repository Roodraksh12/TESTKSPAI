import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("./pages/Login.tsx", () => ({ default: () => <div>Login route</div> }));
vi.mock("./pages/Cases.tsx", () => ({ default: () => <div>Cases route</div> }));
vi.mock("./pages/CaseDetail.tsx", () => ({ default: () => <div>Case detail route</div> }));
vi.mock("./pages/Network.tsx", () => ({ default: () => <div>Network route</div> }));
vi.mock("./routes/ProtectedRoute.jsx", () => ({ default: () => <Outlet /> }));
vi.mock("./routes/RoleRoute.jsx", () => ({ default: () => <Outlet /> }));
vi.mock("./layouts/ProtectedLayout.tsx", () => ({ default: () => <Outlet /> }));

import App from "./App.jsx";

function renderRoute(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("application routes", () => {
  it("renders the public login route", async () => {
    renderRoute("/login");
    expect(await screen.findByText("Login route")).toBeInTheDocument();
  });

  it("loads a lazy case-dossier route", async () => {
    renderRoute("/cases/case-123");
    expect(await screen.findByText("Case detail route")).toBeInTheDocument();
  });

  it("keeps the network route reachable", async () => {
    renderRoute("/network?focusId=case%3Acase-123");
    expect(await screen.findByText("Network route")).toBeInTheDocument();
  });

  it("redirects removed tactical bookmarks to the case directory", async () => {
    renderRoute("/cases/case-123/tactical");
    expect(await screen.findByText("Cases route")).toBeInTheDocument();
  });

  it("redirects unknown routes to login", async () => {
    renderRoute("/missing-page");
    expect(await screen.findByText("Login route")).toBeInTheDocument();
  });
});
