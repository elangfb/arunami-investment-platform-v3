import { google } from 'googleapis'

// Authorized OAuth2 client from env. Reads lazily (at call time) so scripts can
// load .env.local before invoking, and Next can rely on its own env loading.
// Scopes are fixed at consent time (documents + drive) — set in scripts/google-auth.ts.
// The OAuth identity should be a dedicated Mizan Google account (not a real human's
// personal Gmail) — see docs/guides/google-docs-oauth.md for setup + rationale.
export function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI
  if (!clientId || !clientSecret) throw new Error('Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET')
  if (!refreshToken) throw new Error('Missing GOOGLE_REFRESH_TOKEN — run `pnpm google:auth`')
  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
  client.setCredentials({ refresh_token: refreshToken })
  return client
}
