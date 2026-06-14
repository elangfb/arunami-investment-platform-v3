import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isLocked, canAuthor } from './stage-lock'
import type { LoanApplication } from './types'

const at = (stage: number) => ({ stage } as unknown as LoanApplication)

test('analysis is authorable AT or BEFORE the authoring stage (do-it-early), locked after', () => {
  assert.equal(canAuthor(at(1), 'analysis'), true) // early-work window
  assert.equal(canAuthor(at(2), 'analysis'), true) // early-work window
  assert.equal(canAuthor(at(3), 'analysis'), true) // authoring stage
  assert.equal(canAuthor(at(4), 'analysis'), false) // locked once advanced past
})

test('analysis locks once the application advances past stage 3', () => {
  assert.equal(isLocked(at(2), 'analysis'), false)
  assert.equal(isLocked(at(3), 'analysis'), false)
  assert.equal(isLocked(at(4), 'analysis'), true)
  assert.equal(isLocked(at(6), 'analysis'), true)
})
