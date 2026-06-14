import 'server-only'
import { dispatchRead, dispatchWrite } from './dispatch'
import * as prismaImpl from './meetings.prisma'
import * as firestoreImpl from './meetings.firestore'

// Committee-meeting repo — dispatcher (routes to Prisma/Firestore by DATA_BACKEND).

export const listMeetings = dispatchRead(prismaImpl.listMeetings, firestoreImpl.listMeetings)
export const getMeeting = dispatchRead(prismaImpl.getMeeting, firestoreImpl.getMeeting)
export const createMeeting = dispatchWrite('createMeeting', prismaImpl.createMeeting, firestoreImpl.createMeeting)
export const setMeetingStatus = dispatchWrite('setMeetingStatus', prismaImpl.setMeetingStatus, firestoreImpl.setMeetingStatus)
export const setMeetingMinutes = dispatchWrite('setMeetingMinutes', prismaImpl.setMeetingMinutes, firestoreImpl.setMeetingMinutes)
export const setMeetingSchedule = dispatchWrite('setMeetingSchedule', prismaImpl.setMeetingSchedule, firestoreImpl.setMeetingSchedule)
export const setMeetingAttendees = dispatchWrite('setMeetingAttendees', prismaImpl.setMeetingAttendees, firestoreImpl.setMeetingAttendees)
export const meetingHasMomSignatures = dispatchRead(prismaImpl.meetingHasMomSignatures, firestoreImpl.meetingHasMomSignatures)
export const completeMeetingIfAllDecided = dispatchWrite('completeMeetingIfAllDecided', prismaImpl.completeMeetingIfAllDecided, firestoreImpl.completeMeetingIfAllDecided)
