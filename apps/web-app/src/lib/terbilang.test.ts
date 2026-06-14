import test from 'node:test'
import assert from 'node:assert/strict'
import { terbilang } from './terbilang'

test('terbilang — units, teens, tens with se- prefixes', () => {
  assert.equal(terbilang(0), 'nol')
  assert.equal(terbilang(1), 'satu')
  assert.equal(terbilang(10), 'sepuluh')
  assert.equal(terbilang(11), 'sebelas')
  assert.equal(terbilang(12), 'dua belas')
  assert.equal(terbilang(21), 'dua puluh satu')
  assert.equal(terbilang(100), 'seratus')
  assert.equal(terbilang(101), 'seratus satu')
  assert.equal(terbilang(250), 'dua ratus lima puluh')
})

test('terbilang — seribu special vs satu juta', () => {
  assert.equal(terbilang(1000), 'seribu')
  assert.equal(terbilang(1500), 'seribu lima ratus')
  assert.equal(terbilang(21000), 'dua puluh satu ribu')
  assert.equal(terbilang(1_000_000), 'satu juta') // juta keeps "satu", no se-
})

test('terbilang — a realistic plafond', () => {
  assert.equal(terbilang(500_000_000), 'lima ratus juta')
  assert.equal(
    terbilang(1_250_750_000),
    'satu miliar dua ratus lima puluh juta tujuh ratus lima puluh ribu',
  )
})

test('terbilang — floors fractions and ignores sign', () => {
  assert.equal(terbilang(1500.9), 'seribu lima ratus')
  assert.equal(terbilang(-100), 'seratus')
})
