import 'server-only'

import { dispatchWrite } from './dispatch'
import * as prismaImpl from './impersonation-audit.prisma'
import * as firestoreImpl from './impersonation-audit.firestore'

// Impersonation-audit persistence — dispatcher. Routes to the Prisma or Firestore impl by
// DATA_BACKEND (dual = Prisma authoritative + Firestore shadow). Callers (actions/impersonation.ts)
// import from '@/server/repo/impersonation-audit'.

export type { ImpersonationStart } from './impersonation-audit.prisma'

export const recordImpersonationStart = dispatchWrite(
  'recordImpersonationStart',
  prismaImpl.recordImpersonationStart,
  firestoreImpl.recordImpersonationStart,
)

export const endImpersonationSessions = dispatchWrite(
  'endImpersonationSessions',
  prismaImpl.endImpersonationSessions,
  firestoreImpl.endImpersonationSessions,
)
