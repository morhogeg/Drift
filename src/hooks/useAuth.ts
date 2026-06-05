import { useEffect, useState } from 'react'

/**
 * Lightweight local auth: remembers the signed-in username in localStorage and
 * restores the session on mount. (Placeholder until real cloud auth lands —
 * there's no server-side verification yet.)
 */
export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [currentUser, setCurrentUser] = useState<string | null>(null)

  // Restore session on mount.
  useEffect(() => {
    const savedUser = localStorage.getItem('driftUser')
    if (savedUser) {
      setCurrentUser(savedUser)
      setIsAuthenticated(true)
    }
  }, [])

  const login = (username: string) => {
    setCurrentUser(username)
    setIsAuthenticated(true)
    localStorage.setItem('driftUser', username)
  }

  const logout = () => {
    setIsAuthenticated(false)
    setCurrentUser(null)
    localStorage.removeItem('driftUser')
  }

  return { isAuthenticated, currentUser, login, logout }
}
