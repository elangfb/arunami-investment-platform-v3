import { composePlugins, withNx } from '@nx/next'
import type { WithNxOptions } from '@nx/next/plugins/with-nx'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// next.config lives in apps/web-app; the monorepo root is two levels up.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../')

const nextConfig: WithNxOptions = {
  nx: {},
  // Self-host (Tier 0.2): emit a self-contained server at .next/standalone for the
  // Docker runtime stage (no `node_modules` install needed at runtime). Build-only —
  // ignored by `next dev`.
  output: 'standalone',
  // Trace files from the monorepo root so workspace-hoisted deps (pnpm) are included
  // in the standalone bundle.
  outputFileTracingRoot: repoRoot,
  // Keep Prisma packages out of the server bundle (bundling the pg adapter / Prisma
  // client breaks the API routes; they're copied into the standalone trace instead).
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg'],
  experimental: {
    // Document uploads (KYC scans/PDFs) flow through Server Actions; the 1MB default
    // is too small. Cap at 12MB — slightly above the 10MB per-file limit enforced in
    // storeDocumentFile() to leave room for multipart overhead.
    serverActions: { bodySizeLimit: '12mb' },
  },
}

export default composePlugins(withNx)(nextConfig)
