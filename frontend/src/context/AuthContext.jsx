import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import {
  TOKEN_KEY,
  USER_KEY,
  apiRequest,
  clearAuthStorage,
  getStoredUser,
  getToken,
  loginRequest,
} from "../api/client"

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const stored = getStoredUser()

    if (!stored || !getToken()) {
      setLoading(false)
      return
    }

    // Render immediately from the cached profile, then reconcile with the server.
    // Without this the cached copy never refreshes, so a token revoked server-side
    // still renders a signed-in shell, and profile fields added after the officer
    // last logged in stay missing until they sign out and back in.
    setUser(stored)
    setLoading(false)

    apiRequest("/api/auth/me")
      .then((data) => {
        if (cancelled || !data?.user) return
        localStorage.setItem(USER_KEY, JSON.stringify(data.user))
        setUser(data.user)
      })
      .catch((err) => {
        if (cancelled) return
        // Only sign out on an explicit auth rejection — a transient network or
        // server error must not evict a valid session.
        if (err?.status === 401 || err?.status === 403) {
          clearAuthStorage()
          setUser(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (badgeId, password) => {
    const data = await loginRequest(badgeId, password)
    localStorage.setItem(TOKEN_KEY, data.token)
    localStorage.setItem(USER_KEY, JSON.stringify(data.user))
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(() => {
    clearAuthStorage()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      session: user ? { user } : null,
    }),
    [user, loading, login, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider")
  }
  return value
}

/** Compatibility shim for ported Next.js components */
export function useSession() {
  const { user, loading, logout } = useAuth()
  return {
    data: user ? { user } : null,
    status: loading ? "loading" : user ? "authenticated" : "unauthenticated",
  }
}

export function signOut() {
  clearAuthStorage()
  window.location.href = "/login"
}
