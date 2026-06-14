import 'server-only'
import { dispatchRead, dispatchWrite } from './dispatch'
import * as prismaImpl from './customer.prisma'
import * as firestoreImpl from './customer.firestore'

// Customer (Nasabah) repo — dispatcher (routes to Prisma/Firestore by DATA_BACKEND).
export type { PengurusEntry, PemegangSahamEntry, Customer, CreateCustomerInput, CustomerListRow, CustomerDedupMatch } from './customer.prisma'

export const createCustomer = dispatchWrite('createCustomer', prismaImpl.createCustomer, firestoreImpl.createCustomer)
export const getCustomer = dispatchRead(prismaImpl.getCustomer, firestoreImpl.getCustomer)
export const updateCustomerContextMd = dispatchWrite('updateCustomerContextMd', prismaImpl.updateCustomerContextMd, firestoreImpl.updateCustomerContextMd)
export const getCustomerForApplication = dispatchRead(prismaImpl.getCustomerForApplication, firestoreImpl.getCustomerForApplication)
export const findCustomersByIdentity = dispatchRead(prismaImpl.findCustomersByIdentity, firestoreImpl.findCustomersByIdentity)
export const listCustomers = dispatchRead(prismaImpl.listCustomers, firestoreImpl.listCustomers)
export const getCustomerWithApplications = dispatchRead(prismaImpl.getCustomerWithApplications, firestoreImpl.getCustomerWithApplications)
export const findCustomerDedupMatches = dispatchRead(prismaImpl.findCustomerDedupMatches, firestoreImpl.findCustomerDedupMatches)
