# MIZAN — SLA Mechanism

- **Type:** stable spec (domain) · **Status:** Living register · **Last reviewed:** 2026.06.03
- **Provenance:** merged from `brainstorm/SLA.md` (retired); 🏦 Bank per-desk SLAs (SOP slide 4) + 📝 derived rollup.
- **Used by:** the built SLA engine (`lib/sla-utils.ts`, `lib/config/sla-policy.ts`, `deskSlaState`).
- **Review trigger:** Discovery W1 — exact per-desk values + clock-start triggers.

> **Reconcile:** engine is built; the per-desk HK numbers + "sejak dokumen lengkap" clock-start are W1-pending proposals, not live facts.

> Configurable per stage; admin can adjust without code deploy. SLA targets live in **ADMIN-MASTER** as versioned, effective-dated config (append-only — every edit is a new version, history preserved) — see [ADMIN.md](../designs/admin-config-layer.md).

## 🏦 Bank-actual SLAs (per desk/task) — Bank SOP 2026-06-02

> 🏦 These are Hijra's **own SLAs** from the SOP "Reference" slide (transcribed in [HIJRA-BANK-SOP-DIGEST.md](hijra-bank-sop-digest.md)). They are **per-desk/per-task**, not per-our-5-stages, and **tighter** than the prior NoEffort defaults. **Working hours 8 AM – 5 PM, Mon–Fri**; all counts are **hari kerja (business days)**. Several clocks start **"sejak dokumen lengkap"** (on completeness), not on stage entry. Ratify at Discovery W1.

| Desk / task | Bank SLA | Maps to |
|---|---|---|
| **Risk** — Review Usulan | 3 HK (18 jam); processed by queue (antrian) | Stage 4 |
| **Appraisal** — internal | 2 HK sejak visit objek agunan | Stage 2/3 support |
| **Appraisal** — KJPP | 3 HK (short report) · 7–14 HK (long report) | Stage 2/3 support |
| **Legal** — Analisa Yuridis | 2 HK sejak dokumen lengkap | Stage 2 support |
| **Legal** — Review SP3 | 2 HK sejak dokumen lengkap | Post-Komite (SP3) |
| **Legal** — Order Akad | 2 HK setelah dokumen diterima lengkap | Post-Komite (Akad) |
| **Ops** — BI Checking/Pefindo | maks 1 HK (server SLIK/Pefindo normal) | Stage 2 support |
| **Ops** — Pencairan | same-day jika dokumen lengkap ≤ 16:00 WIB; RTGS/Kliring ikut bank penampung dana | Stage 6 |
| **CS** — AML Checking | 1 HK | Stage 1 support |

> ⚠️ **Clock-start nuance**: Bank SLAs key off **"dokumen lengkap"** for most desk tasks — the prior MIZAN counter starts on *stage entry*. Reconcile the counter to start on the completeness event per desk (see [§ Counter mechanics](#counter-mechanics)).

## Per-stage rollup (📝 NoEffort — derived, not from SOP)

> 📝 The SOP gives desk SLAs, not per-our-stage targets. The rollup below is a NoEffort derivation for the pipeline view; Bank confirms the end-to-end target at Discovery W1. The Manifesto-level outcome target ("from 18 days down to under 10") still stands.

| Stage | Derived target | Basis |
|---|---|---|
| Stage 1 · Pengajuan Dokumen | ~3 days 📝 (+ CS AML 1 HK) | RM intake; no SOP number |
| Stage 2 · Legal, Agunan & Biro | Legal 2 HK ∥ RM bureau/SLIK 1 HK ∥ Appraisal 2 HK → ~2–3 HK (parallel) 🏦 | desk SLAs, RM-coordinated |
| Stage 3 · Feasibility / MUAP (5C+1S) | ~3–5 days 📝 | RM analysis; no SOP number |
| Stage 4 · Risk Review / RSK | **3 HK** 🏦 | Risk desk SLA |
| Stage 5 · Committee Decision | next Mon/Wed/Fri session + MOM H+1 🏦 | Komite cadence |
| **Cumulative target** | **<10 days actual** via parallelization + AI 📝 | Manifesto outcome |

> All targets remain **configurable in admin panel**. SLA counter operates on **business days** 🏦 (skip weekends + Indonesian national holidays). **Holiday calendar — done 2026.06.10:** `isJakartaHoliday` wired to a bundled calendar + **admin-set overrides + public-holiday-API fetch** (`server/config/holidays.ts`, `lib/scheduling/jakarta-clock.ts`; managed in the admin Master tab).

## Counter mechanics

- **Starts** when app enters stage (state transition timestamp)
- 🏦 **Bank-SOP nuance**: several desk SLAs (Legal yuridis, Review SP3, Order Akad) start **"sejak dokumen lengkap"** — i.e. when that desk's input set is complete, not on stage entry. For those tasks the counter should key off the completeness event, not the transition. Reconcile during W1.
- **Resets** on forward transition (new stage starts fresh counter; old stage time preserved in audit)
- **Send-back**: app's stage timer resets at the earlier stage; audit trail keeps full history of both visits

## Status thresholds

| Status | Condition | UX |
|---|---|---|
| **Normal** | More than 1 day remaining | Default chip color |
| **At Risk** ⚠️ | Less than 1 day remaining 📝 | Yellow chip + in-app notification to assigned user |
| **Overdue** 🔴 | Past SLA target | Red chip + notification to user **and** direct manager |

At-Risk threshold (currently <1 day) is configurable. 📝

## How it runs

- Background **cron job** (hourly) sweeps all apps in pipeline.
- For each app: compute `(now − entered_stage_at) − paused_time` vs `SLA[stage]`.
- Trigger status transitions (Normal → At Risk → Overdue).
- Push notifications via **Firebase RTDB trigger** → in-app banner + optional email.

## Escalation

> 📝 The 3-tier escalation path (owner → manager → division head) and the "2× SLA" trigger for division-head escalation are **NoEffort defaults** — sources don't specify escalation rules. Bank confirms at Discovery W1 (especially the "direct manager" vs "division head" routing in Hijra's actual orgchart).

| Severity | Notify |
|---|---|
| At Risk | Stage owner only |
| Overdue | Stage owner + direct manager |
| Overdue > 2× SLA | Stage owner + manager + division head |

(Escalation rules configurable; division head escalation is the last line.)

## Admin configuration

Editable via admin panel — no code deploy needed:
- SLA target per stage
- At-Risk threshold (hours before breach)
- **Business day vs calendar day** mode
- Holiday calendar (per year, Indonesian national + Bank operational) — **done 2026.06.10**: bundled calendar + admin overrides + public-API fetch (`server/config/holidays.ts`; admin Master tab)
- Escalation rule (when, to whom)
- Enable/disable email notifications per severity

## Reporting

SLA breaches feed:
- Management dashboard — % of apps meeting SLA per stage per month
- Individual scorecards — analyst's average time-in-stage
- Trend chart — is the team getting faster?
