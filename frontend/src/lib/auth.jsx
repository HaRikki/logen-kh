import { createContext, useContext, useEffect, useState } from 'react'
import { get, post } from './api'

const Ctx = createContext(null)
export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined = loading, null = anonymous
  const refresh = async () => { try { setUser(await get('/auth/me')) } catch { setUser(null) } }
  useEffect(() => { refresh() }, [])
  const logout = async () => { await post('/auth/logout'); setUser(null) }
  return <Ctx.Provider value={{ user, setUser, refresh, logout }}>{children}</Ctx.Provider>
}
export const useAuth = () => useContext(Ctx)
