'use client'

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from 'firebase/auth'

// Firebase client SDK (browser). Config is public (NEXT_PUBLIC_*) by design — these
// identifiers are not secrets; access is enforced server-side (session cookie +
// desk grants). Used only to run the Google sign-in popup and obtain an ID token,
// which is then exchanged for an httpOnly session cookie via /api/auth/session.

// Dev-only Auth Emulator (NEXT_PUBLIC_USE_AUTH_EMULATOR=1): no real Google. The
// sign-in popup becomes the emulator's local chooser ("Add new account" → type any
// email). A fixed `demo-mizan` project + dummy apiKey is used so no real Firebase
// project/keys are needed; the server side mirrors this in server/firebase/admin.ts.
const useEmulator = process.env.NEXT_PUBLIC_USE_AUTH_EMULATOR === '1'
const emulatorHost = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'

const firebaseConfig = useEmulator
  ? {
      apiKey: 'demo-api-key',
      authDomain: 'demo-mizan.firebaseapp.com',
      projectId: 'demo-mizan',
    }
  : {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    }

const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig)

export const auth = getAuth(app)
if (useEmulator) {
  // Idempotent for the same URL (safe across HMR re-evaluation).
  connectAuthEmulator(auth, `http://${emulatorHost}`, { disableWarnings: true })
}
export const googleProvider = new GoogleAuthProvider()
