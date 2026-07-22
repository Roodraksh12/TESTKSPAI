import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useAuth } from "../context/AuthContext"

export default function ProtectedRoute() {
  const { loading, user, mustChangePassword } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-hairline border-t-ink rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading workspace...</p>
        </div>
      </main>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  const onChangePassword = location.pathname === "/change-password"
  if (mustChangePassword && !onChangePassword) {
    return <Navigate to="/change-password" replace />
  }
  if (!mustChangePassword && onChangePassword) {
    const home = user?.capabilities?.defaultHome || "/dashboard"
    return <Navigate to={home} replace />
  }

  return <Outlet />
}
