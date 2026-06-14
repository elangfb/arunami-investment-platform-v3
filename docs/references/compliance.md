# MIZAN — Compliance (regulatory facts)

- **Type:** stable spec (regulatory) · **Status:** Living register · **Last reviewed:** 2026.06.03
- **Provenance:** merged from `brainstorm/COMPLIANCE.md` (retired); Hijra review §4 + NoEffort response §4.
- **Used by:** `../designs/pii-masking.md`, `../guides/layanan-eksternal.md`, `ai-ml-deferred.md`.
- **Review trigger:** Discovery W1 (Google Cloud DPA scope); 17 Dec 2026 in-region deadline.

> **Reconcile:** engineering is built (APAC residency guard, masking, audit) — see `../CURRENT-STATE.md`; this page is the regulatory "why".

> Source: Hijra Bank review §4 (28 Apr 2026) + NoEffort response §4 (7 May 2026). **This page is the legal/regulatory layer.** For the engineering implementation, see [MASKING.md](../designs/pii-masking.md).

## The two regulations that govern everything

### 1. POJK No. 34 Tahun 2025 — IT for BPR/BPRS
- **Pasal 32 ayat (1)** — All electronic systems of the Bank (system, app, operational data) must reside in **Data Center + Disaster Recovery Center within Indonesian territory**.
  → MIZAN code, staging, production = **Hijra Bank infra in Indonesia**.
- **Pasal 27 ayat (5)** — IT service providers must be Indonesian legal entities and **all inference compute must reside in Indonesia**.
  → **Effective date: 17 December 2026.** This is the migration deadline (see below).

### 2. UU No. 27 Tahun 2022 (UU PDP) — Personal Data Protection Law
- **Pasal 56** — Cross-border personal data transfer hierarchy. Must satisfy one (try in order):
  - **(a)** Destination country has equivalent or stronger data protection.
    → ❌ Indonesia hasn't published its country list yet (PP UU PDP still being finalized). No country qualifies right now.
  - **(b)** Adequate and binding safeguards in place — **DPA, SCC, BCR**.
    → ✅ **This is MIZAN's path.** DPA with Google (Vertex AI) + masking/pseudonymization. Hijra is already a GCP customer, so the existing Google Cloud DPA is expected to cover Vertex AI — confirm scope at W1.
  - **(c)** Explicit consent from the data subject.
    → ❌ Not feasible at scale.

## Current posture (2026 — all external AI on Google Cloud)

| Component | Where | Compliance basis |
|---|---|---|
| Code, DB, app servers | Hijra infra (Indonesia) | POJK 34 §32(1) ✅ |
| AI inference (Gemini 3.5 Flash, `gemini-3.5-flash`) | Google Cloud Vertex AI (`asia-southeast1`, Singapore) | UU PDP §56(b) — **Google DPA + mandatory masking** ✅ |
| OCR (Google Document AI, dedicated processor) | Google Cloud, `asia-southeast1` (Singapore) | UU PDP §56(b) — **DPA-scoped dedicated processor; raw documents to OCR only, NOT to generative model** 📝 |
| Local NER (Presidio + spaCy) | Hijra infra (Indonesia) | No external transfer ✅ — **deferred; not currently built** |
| Pseudonym mapping table | PostgreSQL on Hijra infra | Never leaves Bank ✅ |

## ⏰ The 17 December 2026 deadline — in-region inference (DEFERRED)

POJK 34/2025 §27(5) takes full effect on **17 Dec 2026**: **AI inference for Bank data must run inside Indonesia**. This regulatory obligation stands.

> **Decision (2026-06-03): the in-region migration is DEFERRED.** MIZAN V1 runs on **Gemini 3.5 Flash via Google Cloud Vertex AI** under the §56(b) DPA + masking path (cross-border, lawful today). The earlier **Amazon Bedrock Nova plan is dropped** — Hijra is a GCP shop, so all external AI consolidates on Google Cloud (Gemini + Document AI), under one Google Cloud DPA.

> ⚠️ **Honest caveat — this does NOT satisfy §27(5).** Vertex AI **Gemini inference residency is Singapore (`asia-southeast1`), not Indonesia** — Google does **not** serve Gemini from Jakarta (`asia-southeast2`) today (only non-generative Vertex ML services run in Jakarta). Document AI (OCR) is likewise Singapore. So the in-region obligation is **postponed, not met**: by 17 Dec 2026 the Bank must either (a) accept Singapore residency + DPA as its risk posture, (b) move to a provider with Indonesia-region inference, or (c) obtain a regulatory exemption. **Bank decides & funds** — a W1 / post-V1 item, not a V1 build blocker.

**Engineering hedge:** the LLM provider stays **behind an interface** (see build-item 1) so a future in-region swap is a config change, not a refactor.

## Responsibilities

| Item | NoEffort | Hijra Bank |
|---|---|---|
| Implement masking layer | ✅ Build it | — |
| Confirm existing Google Cloud DPA covers Vertex AI (Gemini) | ✅ Provide scope checklist & contact | ✅ Bank Legal confirms |
| Legal/Compliance approval of DPA scope | — | ✅ Bank's Legal & Compliance |
| Documentation to OJK / data authority | — | ✅ Bank's responsibility |
| Decide in-region inference posture by 17 Dec 2026 (deferred) | NoEffort can advise / execute the swap | ✅ Bank decides & funds |

## What this means for the build

> 📝 Items 1–3 below are **NoEffort engineering proposals** (architectural decisions chosen to satisfy the compliance constraints) — sources mandate the *outcome* (masking required, no raw PII to external AI) but not these specific tactics. Item 4 is sourced (Bank §1.1).

1. **LLM provider must be behind an interface** — not directly imported. A future in-region swap should be a config change, not a refactor.
2. **Masking layer is a hard requirement, not a nice-to-have** — see [MASKING.md](../designs/pii-masking.md).
3. **Pre-flight validation before every AI call** — block the request if PII slips through.
4. **Audit log every prompt + response** (masked version) — required by Bank §1.1 and audit obligations.

## Hard gates are admin-tunable + frozen at decision

Compliance consequence: because the DSR/LTV/Kol thresholds in force at committee decision are frozen into the DecisionCheckpoint, MIZAN can answer "what threshold was applied when this financing was decided?" for OJK review — later policy edits never rewrite a past decision. The versioned-config + freeze mechanic is owned by [ADMIN.md](../designs/admin-config-layer.md) (canonical). 📝 NoEffort design; Bank confirms the policy-governance model at Discovery W1.

## Pre-production compliance gate

> The conditions that must hold **before MIZAN handles real customer PII in production**. This is the single referenceable list — consolidated here from "What this means for the build" (above), the Responsibilities table, and the 🔴 blockers in [OPEN-QUESTIONS.md](discovery-open-questions.md). The app side may mirror this app-side; this doc is the source of truth. **Live build status of each gate → [BUILD-STATE.md](../CURRENT-STATE.md)** (this doc defines the gates; BUILD-STATE tracks how far each is built).

| # | Gate | Owner | Status | Basis |
|---|---|---|---|---|
| G1 | Masking layer operational (no raw PII leaves Bank infra) | NoEffort | Build — engineering | Sourced outcome; [MASKING.md](../designs/pii-masking.md) |
| ~~G2~~ | Pre-flight name-scan / NER for free-text PII | NoEffort | ⚠️ **Deferred — accepted residual risk (2026-05-25)** | [MASKING.md](../designs/pii-masking.md) § Known limitation |
| G3 | Audit log of every masked prompt + response | NoEffort | ✅ Done — all surfaces audited (assistant/advisory/narrative/research/discussion) via `recordAiInteraction` → `AiInteraction` (masked prompt+reply); best-effort write (logged, not fail-closed) | Sourced — Bank §1.1 |
| G4 | LLM behind a provider interface (swap-ready for an in-region provider) | NoEffort | ✅ Done — `InferenceProvider` (`server/ai/provider.ts`) on Vercel AI SDK v6; swap via `INFERENCE_PROVIDER` | `COMPLIANCE.md` build-item 1 |
| G5 | **Google Cloud DPA covers Vertex AI (Gemini) inference** | **Hijra Bank Legal** | 🟡 **Confirm at W1** — likely already in place (Hijra is a GCP customer) | UU PDP §56(b); [OPEN-QUESTIONS.md](discovery-open-questions.md) |

**Deadline-driven, not a go-live gate:** in-region AI inference before **17 Dec 2026** per POJK 34 §27(5) — **deferred** (see ⏰ section above); Bank decides & funds. MIZAN ships V1 on Gemini (Vertex AI, Singapore) + §56(b) DPA + masking; the in-region obligation is a Bank decision, not a V1 blocker.

> G1, G3, G4 are within NoEffort's build scope and gate go-live; G5 is a Bank obligation, confirmed at Discovery W1 (the existing Google Cloud DPA is expected to cover Vertex AI). **G2 was demoted** (2026-05-25, human-ratified): NER / pre-flight name-scan / hallucinated-name flagging are deferred to a future version and are **not** go-live blockers. The residual risk — unstructured names in free text can reach the external model — is accepted and documented in [MASKING.md](../designs/pii-masking.md), with compensating controls (known-field masking, NIK/phone/email regex, structurally-blocked risk-levels/recommendation, and the G5 DPA gating egress).

## OCR egress surface — separate, wider acceptance (2026-05-25)

**Context:** Full-document OCR text (KTP, financial statements, etc.) is now fed — **after masking** — as grounding into MUAP/RSK narrative (Gemini). The bracket+regex masking layer (`maskPii`) runs over OCR text before any content leaves Bank infra. Gate inputs (Kol/income/obligations/appraised value) extracted from OCR are human-confirmed before use; DSR/LTV/Kol still computed deterministically — AI never authors gating numbers.

**This is a NEW, SEPARATE human-ratified acceptance (2026-05-25)** — distinct from and larger than the original G2 deferral:
- G2 deferral covered structured narrative fields (small, bounded surface).
- This acceptance covers **full free-text document content** (~100× larger surface).
- The same residual risk applies — unstructured names in OCR text not caught by bracket+regex can reach Gemini — and the same compensating controls apply (hardened masking, residual backstop, hard rule 1 for gating values). ⚠️ The residual backstop is **fail-open by default** as of 2026.06.04 (logs `pii.residual_detected`, still egresses — for demo/presentability); it **must be set fail-closed (`PII_RESIDUAL_BLOCK=1`) before real customer documents are processed** — folded into the go-live condition below.

**Additional go-live condition for prod full-text egress:** G5 DPA signed **AND** Bank-Legal sign-off — both required before real customer documents are processed in production. This is over and above the standard G5 DPA gate.

## 🏦 AML / APU-PPT screening (Bank SOP 2026-06-02)

> 🏦 Surfaced by Hijra's own SOP slides ([HIJRA-BANK-SOP-DIGEST.md](hijra-bank-sop-digest.md), "Communication Line"). The **CS desk** runs **DTTOT, PEP & negative-list checking** (SLA 1 HK) on every application. The prior MIZAN model had **no** AML/sanctions surface — this is a new compliance gate, not just a workflow step.

- **DTTOT** — Daftar Terduga Teroris dan Organisasi Teroris (sanctions/terror watchlist; PPATK / OJK APU-PPT-CFT regime). A name match is a hard block.
- **PEP** — Politically Exposed Persons screening (enhanced due diligence).
- **Negative list** — internal blacklist / prior-fraud check.

**MIZAN V1 scope decision (2026-06-02).** The actual AML screening (DTTOT/PEP/negative-list + any deep-dive) is performed **outside MIZAN** by CS/Compliance. MIZAN's in-system responsibility is limited to:
- a **mandatory RM attestation** at Stage 1 — *"Initial AML checking telah dilakukan dan PASSED"* (deliberately *initial*, not deep-dive);
- making that attestation part of the **MUAP→Risk submit gate** (settable across Inisiasi, stages 1–3; pre-2026.06.12 it was a Stage 1→2 advance gate — relocated by the RM-led redesign); and
- writing it to the **audit trail** (RM identity + timestamp) — the OJK APU-PPT-facing record that initial AML was confirmed before the file advanced.

MIZAN does **not** run screening, hold sanctions lists, or integrate an AML API in V1. This respects segregation of duties: RM attests *initial* awareness; the authoritative control (deep-dive + hard block on a DTTOT match → reject + PPATK report) stays with CS, externally. Workflow placement → [WORKFLOW.md](workflow-detail.md) §"AML / sanctions screening" (the attestation is part of the **MUAP→Risk submit gate** since the RM-led redesign, 2026.06.12; formerly a Stage 1→2 gate). **W1 to confirm**: the Bank accepts attestation-only in V1 (vs wanting in-system screening later). See [OPEN-QUESTIONS.md](discovery-open-questions.md).
