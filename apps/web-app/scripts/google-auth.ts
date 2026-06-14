/**
 * One-time Google OAuth consent (installed-app / loopback flow).
 *
 * Prereqs: apps/web-app/.env.local has GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and
 * GOOGLE_OAUTH_REDIRECT_URI (default http://localhost:53682/oauth2callback), with
 * that exact redirect URI registered on the OAuth client in Google Cloud.
 *
 * Run from repo root:  pnpm google:auth
 * It prints a consent URL; open it in a browser, approve, and the loopback server
 * captures the code, exchanges it, and writes GOOGLE_REFRESH_TOKEN to .env.local.
 */
import http from 'node:http'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { google } from 'googleapis'

// Anchor to apps/web-app/.env.local regardless of the caller's cwd.
const ENV_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../.env.local')

// Scope policy: the OAuth identity is a DEDICATED Mizan Google account (not a real
// human's personal Gmail), so giving it full `drive` access is intentionally broad —
// the only files in that Drive belong to the app, so "all of Drive" = "all of Mizan".
// `drive.file` was tried and dropped: its whitelist behavior 404'd on hand-created
// template Docs even after explicit sharing. See docs/guides/google-docs-oauth.md.
const SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive',
]

function fail(msg: string): never {
  console.error(`\n✗ ${msg}\n`)
  process.exit(1)
}

if (!existsSync(ENV_PATH)) {
  fail(`Missing ${ENV_PATH}. Copy apps/web-app/.env.example → .env.local and fill in GOOGLE_CLIENT_ID/SECRET first.`)
}
config({ path: ENV_PATH })

const clientId = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET
const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || 'http://localhost:53682/oauth2callback'
if (!clientId || !clientSecret) fail('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local before running.')

const port = Number(new URL(redirectUri).port || 53682)
const callbackPath = new URL(redirectUri).pathname

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // force a refresh_token even on re-consent
  scope: SCOPES,
})

function upsertEnv(key: string, value: string): void {
  let text = readFileSync(ENV_PATH, 'utf8')
  const line = `${key}=${value}`
  const re = new RegExp(`^${key}=.*$`, 'm')
  text = re.test(text) ? text.replace(re, line) : `${text.replace(/\s*$/, '')}\n${line}\n`
  writeFileSync(ENV_PATH, text)
}

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.url.startsWith(callbackPath)) {
    res.writeHead(404).end('not found')
    return
  }
  const code = new URL(req.url, redirectUri).searchParams.get('code')
  if (!code) {
    res.writeHead(400).end('missing ?code')
    return
  }
  try {
    const { tokens } = await oauth2.getToken(code)
    if (!tokens.refresh_token) {
      res.writeHead(200).end('Got a token but no refresh_token. Revoke app access at https://myaccount.google.com/permissions and re-run.')
      fail('No refresh_token returned. Revoke prior access and re-run (prompt=consent is set).')
    }
    upsertEnv('GOOGLE_REFRESH_TOKEN', tokens.refresh_token as string)
    res.writeHead(200, { 'content-type': 'text/plain' }).end('✓ Authorized. You can close this tab and return to the terminal.')
    console.log(`\n✓ refresh_token written to ${ENV_PATH}\n`)
    server.close()
    process.exit(0)
  } catch (e) {
    res.writeHead(500).end('token exchange failed')
    fail(`Token exchange failed: ${(e as Error).message}`)
  }
})

server.listen(port, () => {
  console.log('\nOpen this URL in your browser and approve access:\n')
  console.log(authUrl)
  console.log(`\nWaiting for the redirect on ${redirectUri} …\n`)
})
