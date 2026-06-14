import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { __isAuthEmulatorEnabled, __configureAuthEmulatorEnv } from './admin'

// The three env vars the gating logic consults. We snapshot and clear them around every
// test so each case runs from a clean, production-shaped baseline (all unset).
const VARS = [
  'NEXT_PUBLIC_USE_AUTH_EMULATOR',
  'NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST',
  'FIREBASE_AUTH_EMULATOR_HOST',
] as const

let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = Object.fromEntries(VARS.map((v) => [v, process.env[v]]))
  for (const v of VARS) delete process.env[v]
})

afterEach(() => {
  for (const v of VARS) {
    if (saved[v] === undefined) delete process.env[v]
    else process.env[v] = saved[v]
  }
})

test('production baseline — nothing set: emulator OFF, host never mirrored', () => {
  assert.equal(__isAuthEmulatorEnabled(), false)
  __configureAuthEmulatorEnv()
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, undefined)
})

test('NEXT_PUBLIC_USE_AUTH_EMULATOR=1 enables and mirrors the default host', () => {
  process.env.NEXT_PUBLIC_USE_AUTH_EMULATOR = '1'
  assert.equal(__isAuthEmulatorEnabled(), true)
  __configureAuthEmulatorEnv()
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099')
})

// Finding #1 (auth-bypass): a build-baked NEXT_PUBLIC host must NOT, on its own, flip the
// server into credential-skipping emulator mode.
test('NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST alone does NOT enable the emulator', () => {
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST = 'leaked-host:9099'
  assert.equal(__isAuthEmulatorEnabled(), false)
  __configureAuthEmulatorEnv()
  // No enable → no mirror → real-credential path stays intact.
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, undefined)
})

// Finding #4 (client/server symmetry): the client gates only on NEXT_PUBLIC_USE_AUTH_EMULATOR,
// so the server must agree — the NEXT_PUBLIC host is an address, not a trigger.
test('NEXT_PUBLIC host is used as the ADDRESS when enabled by the flag', () => {
  process.env.NEXT_PUBLIC_USE_AUTH_EMULATOR = '1'
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9100'
  assert.equal(__isAuthEmulatorEnabled(), true)
  __configureAuthEmulatorEnv()
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, 'localhost:9100')
})

test('explicit server FIREBASE_AUTH_EMULATOR_HOST enables (matches firebase-admin call-time behavior)', () => {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
  assert.equal(__isAuthEmulatorEnabled(), true)
})

// Finding #5 (precedence): an explicit server-side host wins and is never clobbered by the
// NEXT_PUBLIC fallback.
test('explicit FIREBASE_AUTH_EMULATOR_HOST takes precedence over the NEXT_PUBLIC host', () => {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = 'explicit:9099'
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST = 'public:9100'
  __configureAuthEmulatorEnv()
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, 'explicit:9099')
})
