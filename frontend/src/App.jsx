import { lazy, Suspense } from "react"
import { Navigate, Route, Routes } from "react-router-dom"
import Login from "./pages/Login.tsx"
import ProtectedRoute from "./routes/ProtectedRoute.jsx"
import RoleRoute from "./routes/RoleRoute.jsx"

const ProtectedLayout = lazy(() => import("./layouts/ProtectedLayout.tsx"))
const ForgotPassword = lazy(() => import("./pages/ForgotPassword.tsx"))
const ChangePassword = lazy(() => import("./pages/ChangePassword.tsx"))
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"))
const Overview = lazy(() => import("./pages/Overview.tsx"))
const Analytics = lazy(() => import("./pages/Analytics.tsx"))
const Hotspots = lazy(() => import("./pages/Hotspots.tsx"))
const Cases = lazy(() => import("./pages/Cases.tsx"))
const CaseDetail = lazy(() => import("./pages/CaseDetail.tsx"))
const Chargesheet = lazy(() => import("./pages/Chargesheet.tsx"))
const Network = lazy(() => import("./pages/Network.tsx"))
const FirUpload = lazy(() => import("./pages/FirUpload.tsx"))
const Settings = lazy(() => import("./pages/Settings.tsx"))
const Deadlines = lazy(() => import("./pages/Deadlines.tsx"))
const Audit = lazy(() => import("./pages/Audit.tsx"))
const Profile = lazy(() => import("./pages/Profile.tsx"))
const Administration = lazy(() => import("./pages/Administration.tsx"))
const InviteOfficers = lazy(() => import("./pages/InviteOfficers.tsx"))
const PasswordResets = lazy(() => import("./pages/PasswordResets.tsx"))
const EarlyWarnings = lazy(() => import("./pages/EarlyWarnings.tsx"))

function RouteFallback() {
  return (
    <main className="grid min-h-screen place-items-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-hairline border-t-ink" />
        <p className="text-sm text-muted-foreground">Loading workspace...</p>
      </div>
    </main>
  )
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/change-password" element={<ChangePassword />} />
        <Route element={<ProtectedLayout />}>
          <Route element={<RoleRoute />}>
            <Route path="/overview" element={<Overview />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/hotspots" element={<Hotspots />} />
            <Route path="/early-warnings" element={<EarlyWarnings />} />
            <Route path="/cases" element={<Cases />} />
            <Route path="/cases/:id" element={<CaseDetail />} />
            {/* Preserve old bookmarks without keeping the removed feature reachable. */}
            <Route path="/cases/:id/tactical" element={<Navigate to="/cases" replace />} />
            <Route path="/cases/:id/chargesheet" element={<Chargesheet />} />
            <Route path="/network" element={<Network />} />
            <Route path="/fir/upload" element={<FirUpload />} />
            <Route path="/deadlines" element={<Deadlines />} />
            <Route path="/audit" element={<Audit />} />
            <Route path="/invite" element={<InviteOfficers />} />
            <Route path="/password-resets" element={<PasswordResets />} />
            <Route path="/administration" element={<Administration />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  )
}
