// Pure parser for a Google Drive FOLDER reference (RM-led redesign, design §3 "Document storage").
//
// The RM links each Drive folder by pasting either a browser URL or a raw folder id. This turns
// that free-text into the canonical folder id we persist on Customer.driveFolderId /
// Application.driveFolderId, or null when nothing folder-id-shaped can be found.
//
// Accepted inputs:
//   - https://drive.google.com/drive/folders/<ID>           (+ optional ?query / #fragment)
//   - https://drive.google.com/drive/u/0/folders/<ID>       (the "switch account" URL form)
//   - a RAW folder id on its own: a ~20–44 char [A-Za-z0-9_-] token
//
// A Drive folder id is an opaque base64url-ish token. Real ids are ~28–33 chars, but we accept
// 20–44 to stay forgiving without matching short junk. Anything else → null (the UI shows
// "URL/ID folder tidak valid"). PURE: no IO, no env — safe to unit-test and to call from a client.

/** A raw Drive id token: base64url alphabet, length-bounded so short junk doesn't parse as an id. */
const RAW_ID = /^[A-Za-z0-9_-]{20,44}$/

/** The `/folders/<ID>` segment of a Drive URL (with or without the `/u/<n>` account prefix). */
const FOLDER_URL = /\/folders\/([A-Za-z0-9_-]{20,44})/

/**
 * Parse a Drive folder URL or a raw folder id into the canonical folder id, or null if no
 * folder-id-shaped token can be found. Trims surrounding whitespace first.
 */
export function parseDriveFolderRef(input: string): string | null {
  const trimmed = input.trim()
  if (trimmed.length === 0) return null

  // URL form: pull the id out of a `/folders/<ID>` segment.
  const urlMatch = trimmed.match(FOLDER_URL)
  if (urlMatch) return urlMatch[1]

  // Raw id form: the whole token must be a plausible Drive id (no slashes, no spaces).
  if (RAW_ID.test(trimmed)) return trimmed

  return null
}
