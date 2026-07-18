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

export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers)
  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json")
  }

  const token = getToken()
  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  })

  const contentType = response.headers.get("content-type") || ""
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload?.detail
        ? typeof payload.detail === "string"
          ? payload.detail
          : JSON.stringify(payload.detail)
        : typeof payload === "object" && payload?.error
          ? payload.error
          : "Request failed"
    throw new Error(message)
  }

  return payload
}

export async function loginRequest(badgeId, password) {
  return apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ badgeId, password }),
  })
}
