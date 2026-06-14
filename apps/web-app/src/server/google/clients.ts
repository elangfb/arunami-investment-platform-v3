import { google } from 'googleapis'
import { getOAuthClient } from './auth'
import { stubDocsClient, stubDriveClient } from './stub-clients'

// Googleapis Docs+Drive boundary. DOCS_PROVIDER='stub' (set by scripts/test-e2e.sh)
// short-circuits to in-memory stubs so e2e/CI never touches Google. Default keeps
// the real OAuth client (production + dev). Same env-only pattern as OCR_PROVIDER
// and INFERENCE_PROVIDER — call sites are unchanged.
function isStubDocs(): boolean {
  return process.env.DOCS_PROVIDER === 'stub'
}

export function docsClient() {
  if (isStubDocs()) return stubDocsClient() as unknown as ReturnType<typeof googleDocs>
  return googleDocs()
}

export function driveClient() {
  if (isStubDocs()) return stubDriveClient() as unknown as ReturnType<typeof googleDrive>
  return googleDrive()
}

function googleDocs() {
  return google.docs({ version: 'v1', auth: getOAuthClient() })
}

function googleDrive() {
  return google.drive({ version: 'v3', auth: getOAuthClient() })
}
