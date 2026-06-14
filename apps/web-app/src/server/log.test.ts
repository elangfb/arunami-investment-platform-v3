import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { log, errField } from './log'

// Capture stdout/stderr writes for the duration of one test.
function capture() {
  const out: string[] = []
  const err: string[] = []
  const origOut = process.stdout.write.bind(process.stdout)
  const origErr = process.stderr.write.bind(process.stderr)
  process.stdout.write = ((s: string) => (out.push(s), true)) as typeof process.stdout.write
  process.stderr.write = ((s: string) => (err.push(s), true)) as typeof process.stderr.write
  return {
    out,
    err,
    restore() {
      process.stdout.write = origOut
      process.stderr.write = origErr
    },
  }
}

const savedLevel = process.env.LOG_LEVEL
const savedSilent = process.env.LOG_SILENT
afterEach(() => {
  process.env.LOG_LEVEL = savedLevel
  process.env.LOG_SILENT = savedSilent
})

test('info → stdout as one JSON line with fields', () => {
  delete process.env.LOG_SILENT
  process.env.LOG_LEVEL = 'info'
  const cap = capture()
  try {
    log.info('thing.happened', { appId: 'FOS-001', n: 3 })
  } finally {
    cap.restore()
  }
  assert.equal(cap.out.length, 1)
  assert.equal(cap.err.length, 0)
  const rec = JSON.parse(cap.out[0])
  assert.equal(rec.level, 'info')
  assert.equal(rec.msg, 'thing.happened')
  assert.equal(rec.appId, 'FOS-001')
  assert.equal(rec.n, 3)
  assert.ok(typeof rec.t === 'string' && !Number.isNaN(Date.parse(rec.t)))
})

test('warn + error → stderr; debug suppressed at info level', () => {
  delete process.env.LOG_SILENT
  process.env.LOG_LEVEL = 'info'
  const cap = capture()
  try {
    log.debug('quiet')
    log.warn('careful')
    log.error('boom')
  } finally {
    cap.restore()
  }
  assert.equal(cap.out.length, 0) // debug below threshold
  assert.equal(cap.err.length, 2)
  assert.deepEqual(cap.err.map((l) => JSON.parse(l).level), ['warn', 'error'])
})

test('LOG_SILENT mutes everything', () => {
  process.env.LOG_SILENT = '1'
  const cap = capture()
  try {
    log.error('boom')
  } finally {
    cap.restore()
  }
  assert.equal(cap.out.length + cap.err.length, 0)
})

test('child() stamps bindings; call fields override', () => {
  delete process.env.LOG_SILENT
  process.env.LOG_LEVEL = 'info'
  const cap = capture()
  try {
    log.child({ route: 'ai', appId: 'A' }).info('ok', { appId: 'B' })
  } finally {
    cap.restore()
  }
  const rec = JSON.parse(cap.out[0])
  assert.equal(rec.route, 'ai')
  assert.equal(rec.appId, 'B') // later fields win
})

test('errField — Error normalizes to errName/errMsg; non-Error stringifies', () => {
  process.env.LOG_LEVEL = 'info' // stack only at debug
  const f = errField(new TypeError('bad'))
  assert.equal(f.errName, 'TypeError')
  assert.equal(f.errMsg, 'bad')
  assert.equal(f.errStack, undefined)
  assert.deepEqual(errField('plain'), { errMsg: 'plain' })
})
