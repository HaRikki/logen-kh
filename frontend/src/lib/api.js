const cookie = (n) => document.cookie.split('; ').find((r) => r.startsWith(n + '='))?.split('=')[1]

export class ApiErr extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code } }

export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const h = { ...headers }
  if (body !== undefined) h['Content-Type'] = 'application/json'
  if (method !== 'GET') { const c = cookie('csrf'); if (c) h['X-CSRF-Token'] = decodeURIComponent(c) }
  const r = await fetch(path, { method, headers: h, credentials: 'include', body: body !== undefined ? JSON.stringify(body) : undefined })
  let data = null
  try { data = await r.json() } catch { /* empty */ }
  if (!r.ok) throw new ApiErr(r.status, data?.error?.code || 'error', data?.error?.message || `HTTP ${r.status}`)
  return data
}
export const get = (p) => api(p)
export const post = (p, body = {}) => api(p, { method: 'POST', body })
export const patch = (p, body = {}) => api(p, { method: 'PATCH', body })
export const put = (p, body = {}) => api(p, { method: 'PUT', body })
export const del = (p) => api(p, { method: 'DELETE' })

export const D = '/api/dashboard'
export const A = '/admin/api'
