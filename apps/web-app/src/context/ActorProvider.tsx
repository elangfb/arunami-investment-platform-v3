'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { Actor } from '@/lib/auth/can'

// Client provider fed by the (app) layout RSC (which runs verifySession on the server).
// Exposes the full server-verified Actor (userId, name, avatarInitials, title, desks, superadmin,
// impersonation). Gates use actor.desks / hasDesk; identity comes straight off the Actor. The legacy
// useRole()/currentUser shim is gone — all consumers read the Actor directly.
const ActorContext = createContext<Actor | null>(null)

export function ActorProvider({ actor, children }: { actor: Actor; children: ReactNode }) {
  return <ActorContext.Provider value={actor}>{children}</ActorContext.Provider>
}

/** The full server-verified Actor (desks, superadmin, impersonation, identity). */
export function useActor(): Actor {
  const ctx = useContext(ActorContext)
  if (!ctx) throw new Error('useActor must be used inside ActorProvider')
  return ctx
}
