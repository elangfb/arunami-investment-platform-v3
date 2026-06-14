import 'server-only'

import { dispatchRead } from './dispatch'
import * as prismaImpl from './review-cadence-read.prisma'
import * as firestoreImpl from './review-cadence-read.firestore'

// Review-cadence read joins — dispatcher (routes to Prisma/Firestore by DATA_BACKEND). Consumers:
// server/actions/lineage-read.ts + server/notifications/review-due-notices.ts.
export type { ReviewDueAnchors, ReviewDueFacility } from './review-cadence-read.prisma'

export const getReviewDueAnchors = dispatchRead(prismaImpl.getReviewDueAnchors, firestoreImpl.getReviewDueAnchors)
export const listReviewDueFacilities = dispatchRead(prismaImpl.listReviewDueFacilities, firestoreImpl.listReviewDueFacilities)
