# MIZAN — Tech Stack (final, agreed)

- **Type:** stable spec · **Status:** Living register · **Last reviewed:** 2026.06.03
- **Provenance:** merged from `brainstorm/TECH-STACK.md` (retired); NoEffort response §2.1.
- **Used by:** `../guides/architecture.md`, `../guides/deployment.md`.
- **Review trigger:** Discovery W1 (SSO/IdP, notifications channel).

> **Reconcile:** most of this is built (see `../CURRENT-STATE.md`); AI = Gemini 3.5 Flash on Vertex `asia-southeast1`.

> Source: NoEffort response §2.1 (7 May 2026). Consolidated from earlier multi-language proposal in response to Bank's review.

## Layers

| Layer | Choice | Notes |
|---|---|---|
| **Frontend** | **Next.js + React + TypeScript** | TypeScript is mandatory (Bank §1.2 standard). Tailwind + Shadcn/ui from earlier proposal. |
| **Backend** | **Node.js + TypeScript** (single language) | Consolidated from "Node + Python + Go" after Bank questioned it. Reasons: matches Bank's TypeScript standard, Nx monorepo simplicity, easier handover. |
| **Database** | **PostgreSQL** (only authoritative store) | Hijra Bank standard. All app data + audit trail + pseudonym mapping. |
| **DB migrations** | **Prisma Migrate** | Idiomatic for Node.js (Bank §1.2). |
| **Auth** | **Firebase Auth** (email + password) | **Separate Firebase project** from Bank's production Firebase 📝 (NoEffort engineering decision — sources only specify "Firebase Auth", not project isolation). RBAC (5 roles) + permissions stored in Postgres; Firebase only verifies identity. SSO with Bank IdP (LDAP/AD/Keycloak) is a possible swap — confirm at Discovery (W1). |
| **Notifications** | **Firebase RTDB** (trigger channel only) **OR** Postgres `LISTEN/NOTIFY` | Bank to choose. Firebase RTDB stores **zero PII** — only event metadata (pseudonymous app ID, event type, timestamp). LISTEN/NOTIFY = +200–500 ms latency, manual WebSocket gateway, no Firebase dependency. |
| **AI** | **Gemini 3.5 Flash** (`gemini-3.5-flash`) via Google Cloud Vertex AI | Region: **`asia-southeast1` (Singapore)**. Standard tier **$1.65 / 1M input · $9.90 / 1M output · $0.165 / 1M cached** (non-global endpoint; global $1.50/$9.00 applies until 1 Jul 2026). At ~20–35K tokens/financing (MUAP + 5C+1S + bureau summarization + chat, masked OCR grounding reused via context caching): **≈ $0.10–0.25/financing → ~$3–7/month for ~30 apps** (Batch/Flex −50%, Priority ~+80%) — roughly 4–10× cheaper than the prior Opus estimate (~$30/mo). In-region inference (Indonesia) by 17 Dec 2026 is **deferred** — see [COMPLIANCE.md](compliance.md). |
| **AI Chat** | Same **Gemini** (Vertex AI), multi-turn (rolling 10 turns) | Runtime PII detection on user free-text input — see [MASKING.md](../designs/pii-masking.md). |
| **Local NER** | **Microsoft Presidio + spaCy** (`xx_ent_wiki_sm` or Indonesian model) | Runs **on Bank infra**, not external. For PII masking — see [MASKING.md](../designs/pii-masking.md). |

## Mandatory engineering standards (Bank §1.2)

- **Static typing** everywhere (TypeScript for FE/BE)
- **Test coverage ≥75% per stack** (target ≥80%)
- **Integration tests** (service-to-DB) + **E2E tests** (BE + FE)
- **Test format**: Gherkin (use `cucumber-js` for Node.js)
- **API contract**: OpenAPI 3.1 or 3.2 (optional but recommended)
- **Monorepo**: **Nx** (frontend + backend + tooling in one repo at Hijra infra)
- **Architecture docs**: **C4 model** in-codebase (minimum: Context, Container, Component diagrams)
- **In-codebase docs** for: setup, dev workflow, deployment

## Hosting & access

- **All infrastructure on Hijra Bank's IT infra from day 1** — no vendor cloud, no public GitHub
- **Source code repo, staging, production** all live on Bank infra
- **Access to FOS = VPN-only** (no public exposure)
- DC + DRC + backup + monitoring follow Bank's existing standards

## DevOps

- **CI/CD** with SAST gate on every commit (from W2)
- **DAST** scans on staging (periodic, from W2)
- **Staging** environment from W2 — Bank can demo every Friday 📝 (sources mention weekly demos; Friday specifically is a NoEffort proposal)
- **Production** environment ready by W7 (post-pentest-remediation) 📝 (NoEffort sequencing — Tanggapan §3 doesn't pin production-ready to W7 explicitly)

## Out of stack (don't bring these)

- ❌ Python or Go backends (consolidated to Node)
- ❌ Firebase RTDB as data store (Postgres only)
- ❌ OpenAI / Azure OpenAI / direct Anthropic API (Gemini via Google Cloud Vertex AI is the chosen provider — see [COMPLIANCE.md](compliance.md))
- ❌ Public GitHub / GitLab / personal accounts (Bank infra only)
