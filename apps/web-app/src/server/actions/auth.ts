'use server'

import { redirect } from 'next/navigation'
import { clearSession } from '@/server/auth/session'

// Logout: clear the session cookie (+ best-effort revoke), then go to /login.
// Used by the sidebar "Logout" control and the awaiting-access screen.
export async function logoutAction() {
  await clearSession()
  redirect('/login')
}
