import { NewApplicationForm } from './NewApplicationForm'

// Thin server wrapper (ADR-0020 §2, customerId link-direct prefill). In Next 16 `searchParams` is a
// Promise — read it here (server-side, no CSR bailout / no useSearchParams Suspense boundary needed)
// and pass the optional ?customerId down to the client form. Kept as a plain server component so the
// route stays free of 'use client'; the form module owns the directive.
export default async function NewApplicationPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string | string[] }>
}) {
  const { customerId } = await searchParams
  const id = Array.isArray(customerId) ? customerId[0] : customerId
  return <NewApplicationForm customerId={id || undefined} />
}
