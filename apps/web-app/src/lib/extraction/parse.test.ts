import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLocaleNumber, parseRiskLevel, parseRacBlock } from './parse'

test('parseLocaleNumber: indonesian currency', () => {
  assert.equal(parseLocaleNumber('Rp 2.500.000.000,-'), 2500000000)
  assert.equal(parseLocaleNumber('2.500.000.000'), 2500000000)
  assert.equal(parseLocaleNumber('Rp 185.991.921'), 185991921)
})

test('parseLocaleNumber: percent (id decimal comma)', () => {
  assert.equal(parseLocaleNumber('87,22%'), 87.22)
  assert.equal(parseLocaleNumber('102,21%'), 102.21)
  assert.equal(parseLocaleNumber('15%'), 15)
})

test('parseLocaleNumber: ratio with x suffix', () => {
  assert.equal(parseLocaleNumber('1,2x'), 1.2)
  assert.equal(parseLocaleNumber('2.5x'), 2.5)
  assert.equal(parseLocaleNumber('1,1x'), 1.1)
})

test('parseLocaleNumber: english grouping', () => {
  assert.equal(parseLocaleNumber('1,234,567.89'), 1234567.89)
})

test('parseLocaleNumber: negatives and blanks', () => {
  assert.equal(parseLocaleNumber('-1.234,5'), -1234.5)
  assert.equal(parseLocaleNumber(''), null)
  assert.equal(parseLocaleNumber('   '), null)
  assert.equal(parseLocaleNumber('n/a'), null)
  assert.equal(parseLocaleNumber(null), null)
})

test('parseRiskLevel: english + indonesian', () => {
  assert.equal(parseRiskLevel('Low'), 'low')
  assert.equal(parseRiskLevel('RENDAH'), 'low')
  assert.equal(parseRiskLevel('Sedang'), 'medium')
  assert.equal(parseRiskLevel('Moderate'), 'medium')
  assert.equal(parseRiskLevel('Tinggi'), 'high')
  assert.equal(parseRiskLevel('HIGH'), 'high')
})

test('parseRiskLevel: compound takes the highest', () => {
  assert.equal(parseRiskLevel('Moderate to High'), 'high')
  assert.equal(parseRiskLevel('Sedang ke Tinggi'), 'high')
})

test('parseRiskLevel: unknown → null', () => {
  assert.equal(parseRiskLevel('tinggi sekali banget'), 'high') // still contains "tinggi"
  assert.equal(parseRiskLevel('NA'), null)
  assert.equal(parseRiskLevel(''), null)
  assert.equal(parseRiskLevel(null), null)
})

test('parseRacBlock: pipe-joined rows with leading number', () => {
  const raw = [
    '1 | Pembayaran via BCA | Direkomendasikan escrow account',
    '2 | SCCR awal 87,22% | Setelah penyesuaian 102,21%',
  ].join('\n')
  const items = parseRacBlock(raw)
  assert.equal(items.length, 2)
  assert.deepEqual(items[0], {
    item: 'Pembayaran via BCA',
    justification: 'Direkomendasikan escrow account',
  })
  assert.equal(items[1].item, 'SCCR awal 87,22%')
})

test('parseRacBlock: free text line → item only; blank → empty', () => {
  assert.deepEqual(parseRacBlock('Tidak ada deviasi'), [
    { item: 'Tidak ada deviasi', justification: '' },
  ])
  assert.deepEqual(parseRacBlock(''), [])
  assert.deepEqual(parseRacBlock(null), [])
})
