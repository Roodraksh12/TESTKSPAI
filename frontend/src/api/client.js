const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"
export const TOKEN_KEY = "ksp_token"
export const USER_KEY = "ksp_user"

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function clearAuthStorage() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

const apiCache = new Map()

function detailMessage(payload) {
  if (typeof payload === "object" && payload?.detail) {
    return typeof payload.detail === "string"
      ? payload.detail
      : JSON.stringify(payload.detail)
  }
  if (typeof payload === "object" && payload?.error) return payload.error
  return "Request failed"
}

async function performFetch(path, options, headers) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  })

  const contentType = response.headers.get("content-type") || ""
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    const message = detailMessage(payload)
    const error = new Error(message)
    error.status = response.status
    error.payload = payload

    // Server-side must-change gate: send the user to the change-password screen.
    if (
      response.status === 403 &&
      typeof message === "string" &&
      message.toLowerCase().includes("password change required") &&
      typeof window !== "undefined" &&
      !window.location.pathname.startsWith("/change-password")
    ) {
      const stored = getStoredUser() || {}
      const next = { ...stored, mustChangePassword: true, status: "MUST_CHANGE_PASSWORD" }
      localStorage.setItem(USER_KEY, JSON.stringify(next))
      window.location.assign("/change-password")
    }

    throw error
  }

  return payload
}

export async function apiRequest(path, options = {}) {
  const method = options.method || "GET"
  const isGet = method.toUpperCase() === "GET"

  const headers = new Headers(options.headers)
  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json")
  }

  const token = getToken()
  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  if (isGet && apiCache.has(path)) {
    // SWR-style: return cache immediately, refresh in background
    performFetch(path, options, headers)
      .then((payload) => apiCache.set(path, payload))
      .catch(console.error)

    return apiCache.get(path)
  }

  const payload = await performFetch(path, options, headers)

  if (isGet) {
    apiCache.set(path, payload)
  }

  return payload
}

export async function loginRequest(badgeId, password) {
  return apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ badgeId, password }),
  })
}
