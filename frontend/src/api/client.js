const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "")
export const TOKEN_KEY = "ksp_token"
export const USER_KEY = "ksp_user"

// Deduplicate only requests that are currently in flight. The previous cache
// returned stale jurisdiction data indefinitely and could survive a user
// switch, which is unsafe for a role-scoped police application.
const inFlightGets = new Map()

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
  inFlightGets.clear()
}

function detailMessage(payload) {
  if (typeof payload === "object" && payload?.detail) {
    return typeof payload.detail === "string"
      ? payload.detail
      : JSON.stringify(payload.detail)
  }
  if (typeof payload === "object" && payload?.error) return payload.error
  return "Request failed"
}

function requestHeaders(options) {
  const headers = new Headers(options.headers)
  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json")
  }

  const token = getToken()
  if (token) headers.set("Authorization", `Bearer ${token}`)
  return headers
}

async function responsePayload(response) {
  const contentType = response.headers.get("content-type") || ""
  return contentType.includes("application/json")
    ? await response.json()
    : await response.text()
}

/** Authenticated fetch for binary/streaming endpoints. */
export async function apiFetchResponse(path, options = {}) {
  const hadToken = Boolean(getToken())
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: requestHeaders(options),
  })

  if (!response.ok) {
    const payload = await responsePayload(response)
    const message = detailMessage(payload)
    const error = new Error(message)
    error.status = response.status
    error.payload = payload

    if (
      response.status === 401 &&
      hadToken &&
      path !== "/api/auth/login" &&
      typeof window !== "undefined"
    ) {
      clearAuthStorage()
      if (!window.location.pathname.startsWith("/login")) {
        window.location.assign("/login")
      }
    }

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

  return response
}

async function performFetch(path, options) {
  const response = await apiFetchResponse(path, options)
  return responsePayload(response)
}

export async function apiRequest(path, options = {}) {
  const { fresh = false, ...requestOptions } = options
  const method = requestOptions.method || "GET"
  const isGet = method.toUpperCase() === "GET"

  if (isGet && !fresh && inFlightGets.has(path)) {
    return inFlightGets.get(path)
  }

  const request = performFetch(path, requestOptions)
  if (!isGet || fresh) return request

  inFlightGets.set(path, request)
  try {
    return await request
  } finally {
    if (inFlightGets.get(path) === request) inFlightGets.delete(path)
  }
}

export async function loginRequest(badgeId, password) {
  return apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ badgeId, password }),
  })
}
