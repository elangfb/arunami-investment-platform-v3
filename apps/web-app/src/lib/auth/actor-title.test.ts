import test from 'node:test'
import assert from 'node:assert/strict'
import { actorTitle } from './actor-title'

test('actorTitle — explicit title wins over role name and superadmin', () => {
  assert.equal(
    actorTitle({ title: 'Ketua Komite Pembiayaan', roleNames: ['Komite Pembiayaan'], isSuperadmin: true }),
    'Ketua Komite Pembiayaan',
  )
})

test('actorTitle — falls back to assigned role name(s) when no title', () => {
  assert.equal(actorTitle({ title: null, roleNames: ['Relationship Manager'], isSuperadmin: false }), 'Relationship Manager')
  assert.equal(
    actorTitle({ title: null, roleNames: ['Legal & Appraisal', 'Risk Analyst'], isSuperadmin: false }),
    'Legal & Appraisal · Risk Analyst',
  )
})

test('actorTitle — blank/whitespace title is ignored (the reported empty-line bug)', () => {
  assert.equal(actorTitle({ title: '   ', roleNames: ['Risk Analyst'], isSuperadmin: false }), 'Risk Analyst')
})

test('actorTitle — bootstrapped superadmin (no title, no roles) shows Superadmin', () => {
  assert.equal(actorTitle({ title: null, roleNames: [], isSuperadmin: true }), 'Superadmin')
})

test('actorTitle — brand-new zero-grant user shows awaiting-access', () => {
  assert.equal(actorTitle({ title: undefined, roleNames: [], isSuperadmin: false }), 'Menunggu akses')
})
