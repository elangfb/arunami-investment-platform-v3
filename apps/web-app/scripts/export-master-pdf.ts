// Standalone READ-ONLY Drive PDF export (no app/server-only imports). Exports a master Doc to PDF.
//   tsx scripts/export-master-pdf.ts <docId> <outPath.pdf>
import { google } from 'googleapis'
import { writeFileSync } from 'node:fs'

function drive() {
  const c = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_OAUTH_REDIRECT_URI)
  c.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return google.drive({ version: 'v3', auth: c })
}

async function main() {
  const [docId, out] = process.argv.slice(2)
  if (!docId || !out) throw new Error('usage: export-master-pdf.ts <docId> <out.pdf>')
  const res = await drive().files.export({ fileId: docId, mimeType: 'application/pdf' }, { responseType: 'arraybuffer' })
  writeFileSync(out, Buffer.from(res.data as ArrayBuffer))
  console.log(`wrote ${out}`)
}
void main()
