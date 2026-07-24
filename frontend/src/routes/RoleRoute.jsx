import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useAuth } from "../context/AuthContext"

/** Map route prefixes to capabilities.nav keys. */
const ROUTE_CAPS = [
  { prefix: "/overview", cap: "overview" },
  { prefix: "/dashboard", cap: "copilot" },
  { prefix: "/analytics", cap: "analytics" },
  { prefix: "/hotspots", cap: "hotspots" },
  { prefix: "/deadlines", cap: "deadlines" },
  { prefix: "/cases", cap: "cases" },
  { prefix: "/network", cap: "network" },
  { prefix: "/fir", cap: "firIntake" },
  { prefix: "/audit", cap: "audit" },
  { prefix: "/invite", cap: "invite" },
  { prefix: "/password-resets", cap: "passwordResets" },
  { prefix: "/administration", cap: "administration" },
  { prefix: "/settings", cap: "settings" },
  { prefix: "/profile", cap: "profile" },
]

export default function RoleRoute() {
  const { user } = useAuth()
  const location = useLocation()
  const nav = user?.capabilities?.nav || {}
  const home = user?.capabilities?.defaultHome || "/dashboard"

  const match = ROUTE_CAPS.find(
    (r) => location.pathname === r.prefix || location.pathname.startsWith(r.prefix + "/")
  )
  if (match && nav[match.cap] === false) {
    return <Navigate to={home} replace />
  }
  return <Outlet />
}
