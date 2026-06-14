import { toast } from 'sonner'

// Run a server action from a client handler, surfacing any rejection (desk authz,
// validation) as a toast instead of an unhandled promise rejection. The server
// actions are the security boundary; this is UX defense-in-depth so a stray click
// (e.g. a control a desk shouldn't see) fails loudly, not silently.
export async function runAction<T>(fn: () => Promise<T>, onResult?: (result: T) => void): Promise<void> {
  try {
    const result = await fn()
    onResult?.(result)
  } catch (e) {
    toast.error((e as Error).message || 'Terjadi kesalahan. Coba lagi.')
    console.error(e)
  }
}
