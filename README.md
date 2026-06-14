# Mizan

Mizan is a Next.js application in an Nx/pnpm monorepo for financing origination.

## Docs

Start with `docs/README.md`.

- Current engineering and ops guidance lives in `docs/guides/`.
- Active/future work plans live in `docs/planning/`.
- Durable architecture decisions live in `docs/decisions/`.

Do not add root-level handoff docs; put temporary plans under `docs/planning/` and delete them once their useful knowledge is folded into a guide or ADR.

## Workspace layout

```txt
apps/web-app/   Next.js application
packages/       Shared packages, to be extracted as needed
tools/          Workspace tooling, to be added as needed
```

## Development

```bash
pnpm install
pnpm dev
```

Useful commands:

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm nx show projects
```
