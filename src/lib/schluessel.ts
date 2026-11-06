/** Erkennt secret-/service_role-Schlüssel, damit sie nie versehentlich benutzt werden. */
export function istGeheimerSchluessel(k: string): boolean {
  if (k.startsWith('sb_secret_')) return true
  // Ältere JWT-Schlüssel: Rolle im Payload prüfen
  const teile = k.split('.')
  if (teile.length === 3) {
    try {
      const payload = JSON.parse(atob(teile[1].replace(/-/g, '+').replace(/_/g, '/')))
      return payload.role === 'service_role'
    } catch {
      return false
    }
  }
  return false
}
