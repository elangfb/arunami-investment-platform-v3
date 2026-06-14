# Google Docs / Drive OAuth setup — dedicated Mizan account

Mizan uses **OAuth with a dedicated Google account** (not a real human's personal
Gmail) as the identity for every Google Docs / Drive call. The dedicated account is
"Mizan the app": its only purpose is to own per-app MUAP/RSK Docs in its 15 GB free
Drive. Nobody logs in regularly; the password lives in a vault.

A Service Account was tried first and reverted (commit `81ab26a` / `f4ccd57`) because
SAs have zero Drive storage quota — `files.copy` 403s with "user's Drive storage quota
has been exceeded" unless every copy is parented to a Shared Drive (Workspace-only) or
a user-owned folder. The dedicated-account approach is simpler at the same cost.

## One-time setup

1. **Create the dedicated Mizan Google account** (free Gmail at https://accounts.google.com).
   Naming suggestion: `mizan.app.docs@gmail.com` or similar — something obviously
   non-human. Store the password in your team password manager.

2. **GCP project + APIs** (Console → https://console.cloud.google.com):
   - Pick or create a project.
   - APIs & Services → Library → enable **Google Docs API** and **Google Drive API**.
   - APIs & Services → OAuth consent screen → External → add the dedicated Mizan
     account email as a **Test user**.
   - APIs & Services → Credentials → Create credentials → OAuth client ID →
     **Web application**.
     Authorized redirect URI (exactly): `http://localhost:53682/oauth2callback`
   - Copy the Client ID + Client secret into `apps/web-app/.env.local`:
     ```env
     GOOGLE_CLIENT_ID=...apps.googleusercontent.com
     GOOGLE_CLIENT_SECRET=...
     GOOGLE_OAUTH_REDIRECT_URI=http://localhost:53682/oauth2callback
     ```

3. **Run the consent flow** from repo root:
   ```bash
   pnpm google:auth
   ```
   The script prints a consent URL. Open it in your browser, **sign in with the
   dedicated Mizan account** (not your personal one — if your default Gmail isn't
   the Mizan one, use a fresh incognito window to avoid account confusion). Approve
   the scopes (`documents` + `drive`). The script captures the redirect, exchanges
   the code, and writes `GOOGLE_REFRESH_TOKEN=...` back into `.env.local`.

4. **Create master Docs** in the dedicated Mizan account's Drive:
   - v2 MUAP master, v2 RSK master, References Doc, etc.
   - All app-created per-app Docs land here too (via `files.copy`).
   - Doc IDs go into the env:
     ```env
     GOOGLE_MASTER_MUAP_V2_DOC_ID=...
     GOOGLE_MASTER_RSK_V2_DOC_ID=...
     ```

## Smoke test

```bash
pnpm exec tsx apps/web-app/scripts/write-v2-tokens.ts muap
```

Dry-run should report the doc layout (no 403). If you see 403, double-check:
- The dedicated account owns or has Editor access on the Doc.
- The OAuth consent was completed with the dedicated account (not your personal
  Gmail — refresh token is tied to the account that approved).

## Why `drive` and not `drive.file`

- `drive.file` is whitelist-only: the identity sees only files it created OR were
  picker-shared. With a dedicated Mizan account, EVERY file in that account's Drive
  is a Mizan file by construction — there's nothing else to protect against, so the
  whitelist offers no security benefit but costs 404s on Docs hand-created in Drive UI.
- `drive` (full read/write to all of the identity's Drive) is broad in general but,
  applied to a dedicated single-purpose account, is effectively scoped to "all of
  Mizan". This is the right trade-off for this deployment model.

## Token rotation

Refresh tokens generally don't expire unless:
- The user revokes consent (Account → Security → Third-party access).
- The user's Google password changes (sometimes).
- The token is unused for 6+ months.
- The OAuth app's status changes in GCP (e.g. test → published).

If `pnpm exec tsx apps/web-app/scripts/write-v2-tokens.ts muap` starts returning
`invalid_grant`, re-run `pnpm google:auth` to refresh.

## Operational notes

- **Account custody:** the password belongs to the team / company, not an individual.
  Document who has access in your internal runbook. Enable 2FA on the dedicated account
  with a TOTP token shared across the team (or a hardware key in the org's safe).
- **Doc ownership:** every per-app Doc the engine creates is owned by the dedicated
  account. If the account is ever lost, every Doc is lost. Back up the credentials.
- **Per-user sharing (ADR-0014):** a per-app Doc starts private to this account. When a
  staff member opens the MUAP/RSK panel, the app auto-shares that Doc to **their** Google
  email at the right role (writer for the maker, reader for other participants) via Drive
  `permissions.create` — so each Doc accrues per-email grants for the humans who worked it
  (recorded in `DocAccessGrant`). This is expected; it is **never** "anyone with the link"
  (the Docs carry customer PII). Staff therefore need a Google-capable login email.
  When a superadmin impersonates, the share goes to the superadmin's own email (the
  browser identity that opens the Doc), not the impersonated desk.
- **Quota:** 15 GB free covers thousands of MUAP/RSK Docs (each is tiny — under 100 KB).
  Upgrade to Google One ($) or Workspace when nearing the cap.
- **Audit attribution:** every Doc edit logs as the dedicated Mizan account in revision
  history — opaque per-edit but unambiguous "this was the app". Mizan's first-party
  audit trail (`AiInteraction`, `ImpersonationAudit`, commits) remains the source of
  truth for who actually triggered the action.
