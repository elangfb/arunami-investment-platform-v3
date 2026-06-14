import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { exportDocMarkdown } from './service'
import { seedStubDoc, clearStubDocsState } from '../google/stub-clients'
import { prisma } from '../db'

// This itest exercises the stub docs provider — set it before any docsClient() call (node's
// --test isolates each file in its own process, so this does not leak to other itests).
process.env.DOCS_PROVIDER = 'stub'

// Integration test (real Postgres *_test + DOCS_PROVIDER=stub) for the Markdown read-back export
// path (document-system.md §Read): a linked source Doc → Markdown text; no linkage → null. The
// AI-analysis consumer is a separate future feature; this proves the export capability it will call.

const APP = 'ITEST-MDEXPORT-1'

before(() => {
  assert.match(process.env.DATABASE_URL ?? '', /mizan_test/, 'integration tests require a *_test DB')
})

beforeEach(async () => {
  await prisma.docLinkage.deleteMany({ where: { applicationId: APP } })
  clearStubDocsState()
})

after(async () => {
  await prisma.docLinkage.deleteMany({ where: { applicationId: APP } })
  await prisma.$disconnect()
})

test('exportDocMarkdown — exports a linked Doc to markdown text', async () => {
  const muapDocId = seedStubDoc({ kind: 'muap', namedRanges: { nama_perusahaan: 'PT Demo' } })
  const rskDocId = seedStubDoc({ kind: 'rsk' })
  await prisma.docLinkage.create({ data: { applicationId: APP, muapDocId, rskDocId, templateVersion: 'v1' } })

  const md = await exportDocMarkdown(APP, 'muap')
  assert.equal(typeof md, 'string')
  assert.ok((md ?? '').includes(muapDocId), 'export resolves the linked MUAP Doc')

  const rskMd = await exportDocMarkdown(APP, 'rsk')
  assert.ok((rskMd ?? '').includes(rskDocId), 'export resolves the linked RSK Doc')
})

test('exportDocMarkdown — an application with no linked Docs returns null', async () => {
  assert.equal(await exportDocMarkdown('ITEST-MDEXPORT-NONE', 'muap'), null)
})
