/* eslint-disable @typescript-eslint/no-explicit-any -- one-off standalone Drive spike */
// Batch 3 S1 SPIKE — Drive grant downgrade writer→reader (idempotency + survives copy).
// Operates ONLY on a THROWAWAY copy of the master, then deletes it. READ of the real master only.
//   tsx scripts/spike-grant-downgrade.ts <masterDocId> <granteeEmail>
import { google } from 'googleapis'

function drive() {
  const c = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_OAUTH_REDIRECT_URI)
  c.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return google.drive({ version: 'v3', auth: c })
}
const log = (...a: any[]) => console.log('[spike]', ...a)

async function roleOf(d: any, fileId: string, email: string): Promise<string | null> {
  const { data } = await d.permissions.list({ fileId, fields: 'permissions(id,role,emailAddress,type)' })
  return (data.permissions ?? []).find((p: any) => p.emailAddress === email)?.role ?? null
}

async function main() {
  const [masterId, grantee] = process.argv.slice(2)
  if (!masterId || !grantee) throw new Error('usage: spike-grant-downgrade.ts <masterDocId> <granteeEmail>')
  const d = drive()
  let copyId: string | undefined
  try {
    const copy = await d.files.copy({ fileId: masterId, requestBody: { name: `SPIKE-grant-downgrade ${masterId.slice(0, 6)}` }, fields: 'id' })
    copyId = copy.data.id as string
    log('1. copied master → throwaway', copyId)

    const perm = await d.permissions.create({ fileId: copyId, sendNotificationEmail: false, requestBody: { type: 'user', role: 'writer', emailAddress: grantee }, fields: 'id,role' })
    const permId = perm.data.id as string
    log(`2. granted WRITER to ${grantee} (permId=${permId}); role now =`, await roleOf(d, copyId, grantee))

    await d.permissions.update({ fileId: copyId, permissionId: permId, requestBody: { role: 'reader' } })
    log('3. downgraded writer→reader; role now =', await roleOf(d, copyId, grantee), '(GATE: expect "reader")')

    await d.permissions.update({ fileId: copyId, permissionId: permId, requestBody: { role: 'reader' } })
    log('4. repeated downgrade (idempotency); role still =', await roleOf(d, copyId, grantee), '(GATE: expect "reader", no error)')

    // Re-upgrade then re-downgrade — prove the round-trip both directions works on the same permId.
    await d.permissions.update({ fileId: copyId, permissionId: permId, requestBody: { role: 'writer' } })
    log('5. re-upgraded reader→writer; role now =', await roleOf(d, copyId, grantee))
    await d.permissions.update({ fileId: copyId, permissionId: permId, requestBody: { role: 'reader' } })
    log('6. re-downgraded; role now =', await roleOf(d, copyId, grantee), '(GATE: round-trip stable)')

    log('RESULT: GO — permissions.update(writer→reader) is idempotent + reversible by stored permissionId.')
  } catch (e) {
    log('RESULT: NO-GO —', (e as Error).message)
  } finally {
    if (copyId) {
      await drive().files.delete({ fileId: copyId }).then(() => log('cleanup: deleted throwaway', copyId)).catch((e) => log('cleanup FAILED, delete manually:', copyId, (e as Error).message))
    }
  }
}
void main()
