import { Navigate, Route, Routes } from "react-router-dom"
import Login from "./pages/Login.tsx"
import ProtectedRoute from "./routes/ProtectedRoute.jsx"
import ProtectedLayout from "./layouts/ProtectedLayout.tsx"
import Dashboard from "./pages/Dashboard.tsx"
import Overview from "./pages/Overview.tsx"
import Analytics from "./pages/Analytics.tsx"
import Hotspots from "./pages/Hotspots.tsx"
import Cases from "./pages/Cases.tsx"
import CaseDetail from "./pages/CaseDetail.tsx"
import Tactical from "./pages/Tactical.tsx"
import Chargesheet from "./pages/Chargesheet.tsx"
import Network from "./pages/Network.tsx"
import FirUpload from "./pages/FirUpload.tsx"
import Settings from "./pages/Settings.tsx"
import Deadlines from "./pages/Deadlines.tsx"
import Audit from "./pages/Audit.tsx"
import Profile from "./pages/Profile.tsx"

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<ProtectedLayout />}>
          <Route path="/overview" element={<Overview />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/hotspots" element={<Hotspots />} />
          <Route path="/cases" element={<Cases />} />
          <Route path="/cases/:id" element={<CaseDetail />} />
          <Route path="/cases/:id/tactical" element={<Tactical />} />
          <Route path="/cases/:id/chargesheet" element={<Chargesheet />} />
          <Route path="/network" element={<Network />} />
          <Route path="/fir/upload" element={<FirUpload />} />
          <Route path="/deadlines" element={<Deadlines />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
