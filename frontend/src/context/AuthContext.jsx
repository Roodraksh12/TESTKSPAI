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
        // Only clear on explicit unauthenticated — never on transient 5xx/network.
        if (err?.status === 401) {
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
    const userPayload = {
      ...data.user,
      mustChangePassword: Boolean(data.mustChangePassword || data.user?.mustChangePassword),
    }
    localStorage.setItem(USER_KEY, JSON.stringify(userPayload))
    setUser(userPayload)
    return userPayload
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
      mustChangePassword: Boolean(user?.mustChangePassword || user?.status === "MUST_CHANGE_PASSWORD"),
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
  const { user, loading } = useAuth()
  return {
    data: user ? { user } : null,
    status: loading ? "loading" : user ? "authenticated" : "unauthenticated",
  }
}

export function signOut() {
  clearAuthStorage()
  window.location.href = "/login"
}
