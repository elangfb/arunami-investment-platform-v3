# ADR-0007: Stage-2 origination is RM-coordinated; Legal & Appraisal gate MUAP→Risk (not 2→3)

- **Status:** accepted
- **Date:** 2026.06.06
- **Supersedes:** the as-built Stage-2 **dual-sign-off** (LG legal-verify + RT/SLIK co-sign gating the 2→3 advance via `legalSlikComplete`) and corrects the stale "LG + RA dual-sign-off" framing in `references/workflow-detail.md`.
- **Source of truth:** `references/sources/Hijra Bank Process - 1 Flow Proses Pembiayaan.jpeg`, `…- 2 Flow by Detail.jpeg`, `…- 3 Communication Line.jpeg` (digested in `references/hijra-bank-sop-digest.md`).

## Context

The Hijra source shows **Marketing (RM) as the central hub** that coordinates the whole origination (the "Communication Line" sheet literally draws RM at the centre, every other function a spoke). In the flow:

- RM does the **visit + document check**, pulls and summarizes **SLIK/Pefindo/rek-koran** (RM's own data work), and **dispatches** two functions to **Legal & Appraisal** — *Analisa Yuridis* (legal) and *Penilaian internal/KJPP* (appraisal) — via Jira links (orchestrated **outside** Mizan).
- Those deliverables flow **into** *Pembuatan MUAP*; RM builds the MUAP, then **submits it to Risk** ("Submit MUAP untuk review Risk", step 7).
- **Risk Analyst only reviews the MUAP** — it never participates in Stage 2.
- **Legal & Appraisal is ONE role/lane** with two functions (the swimlane is literally "Legal & Appraisal"; the comms sheet breaks them into Legal + Appraisal threads of the same team).
- AML (DTTOT/PEP/negative-list) is **CS's** check (recorded, not screened by Mizan).

The as-built Mizan model diverged: Stage 2 was a **dual sign-off** — LG verifies every required doc + RT/SLIK co-signs — and `legalSlikComplete` **gated the 2→3 advance**, treating Legal as a co-equal *gating* actor (and stale docs implied "LG + RA"). That is upside-down relative to the source: Legal & Appraisal are dispatched **supports**, not the gate; RM is the coordinator; and the real prerequisite is *"the MUAP can't go to Risk until Legal & Appraisal are done."*

## Decision

1. **RM coordinates Stage-2 origination end-to-end** (the Marketing hub). RM proceeds through doc collection → MUAP-prep at its own pace; **there is no Legal-sign gate on the 2→3 advance.**
2. **Legal & Appraisal is one role, two tracked deliverables:** *Analisa Yuridis* (legal) + *Penilaian internal/KJPP* (appraisal). RM dispatches them (Jira, external); **Mizan records the request + result/path** for SLA + audit. They are **tracked-not-gating** at Stage 2.
3. **The gate relocates to the MUAP→Risk boundary:** the MUAP **cannot be submitted to Risk** (advance to RSK / Stage 4) **until both Analisa Yuridis and Penilaian are complete** — a data-dependency prerequisite (they feed the MUAP). Enforced server-side on the MUAP→Risk advance, with a clear blocker reason.
4. **SLIK/Pefindo + Kol are RM's own data work** feeding the MUAP (the Kol hard-gate is unchanged). Not a separate co-sign desk.
5. **Risk Analyst is NEVER a Stage-2 actor** — RA only does *Review Usulan Pembiayaan* (the MUAP review, Stage 4).
6. **AML stays a recorded attestation** (CS screens externally; Mizan records — the existing "records, doesn't screen" stance).

## Consequences

- `legalSlikComplete` is **no longer the 2→3 gate**; legal-verify + appraisal completion become the **precondition for the MUAP→Risk advance** (gating the MUAP-ladder request / Stage-3→4 transition).
- The Dokumen-tab **"Review Legal belum dikirim" hard-gate banner is removed**; Analisa Yuridis + Penilaian become RM-coordinated tracked deliverables (moved off the document-upload framing — see the AML/Appraisal → Data-tab move).
- **Control moves downstream** — Risk Review + Komite are the gates; the MUAP must incorporate the legal + appraisal results. This is the source's "Mizan records, doesn't gate" applied to Stage 2.
- Per-desk **SLA values are now sourced** (`#4 Reference & SLA`) and inform W1 config: Analisa Yuridis 2 HK, Appraisal internal 2 HK / KJPP-short 3 HK / KJPP-long 7–14 HK, AML 1 HK (CS), Risk 3 HK (18 jam), BI-Checking/Pefindo ≤1 HK (Ops), Pencairan same-day (docs by 16:00).
- Corrects the stale "LG + RA dual-sign-off" note in `references/workflow-detail.md`.
- The MUAP maker-checker ladder (ADR-0003) is unchanged; this ADR only adds the Legal&Appraisal-complete precondition to the MUAP→Risk handoff.
