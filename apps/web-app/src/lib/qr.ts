// QR signing URLs (document-system.md §Signing).
//
// - The VERIFY url is what a scanned QR resolves to: the internal, auth-walled /qr/<token> page.
//   Pass an absolute base for the QR PAYLOAD (it must scan to a real URL); omit it for in-app links.
// - The IMAGE url is the external QR-render API that turns the verify URL into a PNG Google can fetch
//   into the Doc (insertInlineImage cannot take base64). The render API only ever sees the opaque,
//   no-PII verify URL; Google fetches the PNG once and stores its own copy.

const QR_RENDER_API = 'https://api.qrserver.com/v1/create-qr-code/'

/** Internal verify URL a scanned QR points to. Absolute (with base) for the QR payload; relative for in-app links. */
export function qrVerifyUrl(token: string, baseUrl?: string): string {
  const path = `/qr/${encodeURIComponent(token)}`
  return baseUrl ? `${baseUrl.replace(/\/+$/, '')}${path}` : path
}

/** External QR-render API URL → a PNG of the (absolute) verify URL, for insertInlineImage into the Doc. */
export function qrImageUrl(token: string, baseUrl: string, size = 300): string {
  const data = encodeURIComponent(qrVerifyUrl(token, baseUrl))
  return `${QR_RENDER_API}?size=${size}x${size}&data=${data}`
}
