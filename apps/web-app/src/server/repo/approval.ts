import 'server-only'
import { dispatchRead, dispatchWrite } from './dispatch'
import * as prismaImpl from './approval.prisma'
import * as firestoreImpl from './approval.firestore'

// Append-only approval-ladder repo — dispatcher (routes to Prisma/Firestore by DATA_BACKEND).
export type { ApprovalStepRow, QrVerification } from './approval.prisma'

export const loadApprovalSteps = dispatchRead(prismaImpl.loadApprovalSteps, firestoreImpl.loadApprovalSteps)
export const loadMomSignatures = dispatchRead(prismaImpl.loadMomSignatures, firestoreImpl.loadMomSignatures)
export const appendApprovalStep = dispatchWrite('appendApprovalStep', prismaImpl.appendApprovalStep, firestoreImpl.appendApprovalStep)
export const appendMomSignature = dispatchWrite('appendMomSignature', prismaImpl.appendMomSignature, firestoreImpl.appendMomSignature)
export const verifyQrToken = dispatchRead(prismaImpl.verifyQrToken, firestoreImpl.verifyQrToken)
