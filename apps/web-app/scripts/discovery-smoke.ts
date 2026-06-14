// LIVE smoke for the real Google Drive discovery provider (P2). Creates a throwaway folder tree in the
// dedicated Mizan account's Drive, lists it through googleDriveProvider().listFolderTree, prints the
// result, then trashes the throwaway folder (its OWN test artifact). Run: tsx scripts/discovery-smoke.ts
import { google } from 'googleapis'
import { getOAuthClient } from '../src/server/google/auth'
import { googleDriveProvider } from '../src/server/discovery/google'

const FOLDER_MIME = 'application/vnd.google-apps.folder'

async function main() {
  const drive = google.drive({ version: 'v3', auth: getOAuthClient() })

  const mkFolder = async (name: string, parent?: string) => {
    const res = await drive.files.create({
      requestBody: { name, mimeType: FOLDER_MIME, ...(parent ? { parents: [parent] } : {}) },
      fields: 'id',
    })
    return res.data.id as string
  }
  const mkFile = async (name: string, parent: string, body: string) => {
    const res = await drive.files.create({
      requestBody: { name, parents: [parent] },
      media: { mimeType: 'application/pdf', body },
      fields: 'id, md5Checksum',
    })
    return res.data
  }

  const root = await mkFolder('MIZAN-DISCOVERY-SMOKE')
  console.log('created throwaway root folder:', root)
  try {
    const ktp = await mkFolder('KTP', root)
    await mkFile('KTP Budi.pdf', ktp, '%PDF-1.4 fake ktp bytes for smoke')
    await mkFile('NPWP Budi.pdf', root, '%PDF-1.4 fake npwp bytes for smoke')
    await mkFile('Foto Liburan.pdf', root, '%PDF-1.4 unrelated file')

    const files = await googleDriveProvider().listFolderTree(root)
    console.log('\nlistFolderTree result:')
    for (const f of files) console.log(`  path="${f.path}"  fileId=${f.fileId?.slice(0, 8)}…  md5=${f.sha256?.slice(0, 8) ?? '(none)'}`)
    console.log(`\ntotal files: ${files.length} (expect 3: KTP/KTP Budi.pdf, NPWP Budi.pdf, Foto Liburan.pdf)`)
    const paths = files.map((f) => f.path).sort()
    const ok = paths.includes('KTP/KTP Budi.pdf') && paths.includes('NPWP Budi.pdf') && files.every((f) => f.fileId && f.sha256)
    console.log('SMOKE', ok ? 'PASS ✅ (folder path + md5 content-address present)' : 'FAIL ❌')
  } finally {
    await drive.files.update({ fileId: root, requestBody: { trashed: true } })
    console.log('\ntrashed throwaway folder', root, '(cleanup)')
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('SMOKE ERROR', e?.message ?? e); process.exit(1) })
