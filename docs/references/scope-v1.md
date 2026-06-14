# MIZAN — Scope (v1)

- **Type:** stable spec (project) · **Status:** Living register · **Last reviewed:** 2026.06.03
- **Provenance:** merged from `brainstorm/SCOPE.md` (retired). **Payment + warranty sections omitted** (work-contract).
- **Used by:** scope guardrails; pairs with `project-overview.md`.
- **Review trigger:** Discovery W1.

> **Reconcile:** v1 scope-of-work only; commercial terms (price/payment/warranty) live in the work contract, not here.

> Source: NoEffort response 7 May 2026 + Hijra review 28 Apr 2026. **Fixed price Rp 35M, 8 weeks.**

## In scope (the fixed price covers all of this)

- Discovery, PRD, technical architecture, security planning
- UI/UX design (high-fidelity)
- Frontend (Next.js + React + TypeScript)
- Backend + API (Node.js + TypeScript)
- Authentication (Firebase Auth) + RBAC (5 roles in Postgres)
- Audit trail baseline (login, permission denied, data changes)
- Loan application lifecycle: intake → draft → review → committee approval
- Document module: upload, version control, secure storage, AI extraction
- AI module — **Generate Analysis** (5C+1S, 1× per loan application)
- AI module — **AI Chat Assistant** (multi-turn, with runtime PII detection)
- Real-time notifications (Firebase RTDB trigger *or* PG `LISTEN/NOTIFY` — TBD)
- Reporting + complete audit trail
- Test coverage **≥75% per stack**, integration + E2E (Gherkin format)
- C4 documentation in-repo
- CI/CD, staging + production, all on Hijra Bank infrastructure
- Slot for SAST + DAST + pentest + remediation
- **2 sessions** IT handover + **2 sessions** end-user training (RM/analyst)
- **30-day warranty** post Go-Live (see Warranty section)

## Out of scope (v1)

| Item | Status |
|---|---|
| Native mobile apps (iOS/Android) | Not in v1 |
| Branding, logo, content copywriting | Bank's responsibility |
| Third-party licenses (cloud, gateway) | Bank pays separately |
| Bulk data migration (>10,000 records) | Separate engagement |
| **Core banking integration** (T24 / IBSS / etc.) | **Manual upload (CSV/Excel/PDF) in v1**; automated integration = post-launch change request |
| Penetration testing (formal external) | Done by Bank's Security team — vendor remediates only |
| End-user training beyond 2 sessions | Additional cost |
| Maintenance after 30-day warranty | Separate contract (see Warranty section) |
| **Akad contract document generation** | Not in v1 — the Stage-6 workflow ("Proses Akad") is built, but Mizan generates only MUAP/RSK/MoM/SP3; the akad contract is authored/signed **outside Mizan** (no master template, no W1 akad params). Decided 2026.06.08. |
| **Branch/region master-data** | Not in v1 — `config-and-admin` item 4 resolved OUT (human, 2026.06.09). Not demo-critical; adds routing/reporting surface. Defer ownership + seed defaults + routing/reporting impact to post-v1. |

## ✅ Resolved: V1 ships the full 6-stage flow

V1 implements the **6-stage business workflow** (Pengajuan Dokumen → Legal, Agunan & Biro → Feasibility/MUAP → Risk Review/RSK → Committee Decision → Pencairan) as described in [WORKFLOW.md](workflow-detail.md), which owns the canonical stage names (and the note that the Sprint 2 `Draft → Review → Approval` phrase was vendor shorthand, not MIZAN terminology).

## Training (clarified during negotiation)

| Type | Sessions | Audience |
|---|---|---|
| IT handover | 2 | Bank IT team — setup, deployment, troubleshooting, system docs |
| End-user training | 2 | RM + financing analysts — daily workflow, AI features, data input |
