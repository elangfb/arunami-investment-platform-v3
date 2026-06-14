/**
 * Document-upload domain layer over the engine-agnostic S3 client (`./s3`).
 * Owns the compliance-relevant rules for stored client documents:
 *   • what file types/sizes are accepted (KYC scans: PDF + common image formats),
 *   • how object keys are namespaced (per application, per document),
 *   • capturing the integrity facts (SHA-256, size, content-type) to persist.
 * The upload server actions call `storeDocumentFile`; the retrieval proxy calls `getDocument`.
 */
import { fileTypeFromBuffer } from 'file-type'
import { putDocument, getDocument, sha256 } from './s3'

/** Accepted MIME types for client documents — scanned KYC paperwork. */
export const ALLOWED_DOC_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
] as const

/** Max accepted upload size. Scanned multi-page PDFs run large; cap to bound abuse. */
export const MAX_DOC_BYTES = 10 * 1024 * 1024 // 10 MB

export type StoredDocument = {
  storageKey: string
  sha256: string
  sizeBytes: number
  contentType: string
  fileName: string
}

/**
 * The TRUE MIME derived from the file's bytes (via `file-type`) if it is an accepted
 * document type, else null. Authoritative content-type detection — never trusts the
 * client-declared `file.type` (spoofable). Guards against e.g. an executable renamed `.pdf`.
 */
export async function detectAcceptedType(bytes: Buffer | Uint8Array): Promise<string | null> {
  const ft = await fileTypeFromBuffer(bytes)
  if (!ft) return null
  return (ALLOWED_DOC_TYPES as readonly string[]).includes(ft.mime) ? ft.mime : null
}

/** Stable, namespaced object key: applications/<appId>/<docId>/<ts>-<safeName>. */
function documentKey(appId: string, docId: string, fileName: string): string {
  const safe = fileName.replace(/[^\w.-]+/g, '_').slice(0, 120) || 'dokumen'
  return `applications/${appId}/${docId}/${Date.now()}-${safe}`
}

/**
 * Validate and persist an uploaded File's bytes to object storage.
 * Throws a user-facing (Bahasa) error on a rejected type/size/empty file.
 * Returns the integrity facts to store on the ApplicationDocument row.
 */
export async function storeDocumentFile(
  appId: string,
  docId: string,
  file: File,
): Promise<StoredDocument> {
  if (!file || file.size === 0) throw new Error('Berkas kosong atau tidak terbaca.')
  if (file.size > MAX_DOC_BYTES) {
    throw new Error(`Ukuran berkas melebihi batas ${MAX_DOC_BYTES / (1024 * 1024)} MB.`)
  }
  const bytes = Buffer.from(await file.arrayBuffer())
  // Authoritative type from the bytes — NOT the spoofable declared file.type.
  const contentType = await detectAcceptedType(bytes)
  if (!contentType) {
    throw new Error('Jenis berkas tidak didukung atau isi tidak cocok. Gunakan PDF atau gambar (PNG/JPEG/WEBP/TIFF).')
  }
  const key = documentKey(appId, docId, file.name)
  const { sha256: digest, size } = await putDocument(key, bytes, contentType)
  return { storageKey: key, sha256: digest, sizeBytes: size, contentType, fileName: file.name }
}

export { getDocument, sha256 }
