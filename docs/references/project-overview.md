# MIZAN — Project Overview

- **Type:** stable spec (project framing) · **Status:** Living register · **Last reviewed:** 2026.06.03
- **Provenance:** merged from `brainstorm/PROJECT-OVERVIEW.md` (retired 2026.06.03); origin = NoEffort×Hijra proposal + Manifesto.
- **Used by:** onboarding; pairs with `../GLOSSARY.md`, `personas.md`, `scope-v1.md`.
- **Review trigger:** revisit after Discovery W1.

> **Reconcile:** the "5 stages" framing is the discovery model; as-built is 6-stage/desk (`../GLOSSARY.md`, `../CURRENT-STATE.md`). RM-led restructure is the confirmed go-forward target (`../designs/workflow-target.md`).

## In one sentence

**MIZAN is the system that decides who PT BPRS Hijra Alami lends money to — and records why.**

## Names & meaning

- **MIZAN** (مِيزان) — "the scales" in Arabic; Qur'anic symbol of justice and balance. The product is built around the idea that *every financing decision is a weighing*.
- **Hijra Bank** — informal name. Legal entity is **PT BPRS Hijra Alami**.
- **BPRS** — *Bank Pembiayaan Rakyat Syariah*, Indonesia's tier-2 Islamic micro-finance institution category. Smaller deal sizes, SME / micro focus, ~30 financings/month.
- **FOS** — *Financing Origination System*, the product category MIZAN belongs to.

## The problem

Today: an analyst pulls data from multiple systems by hand, drafts a **MUAP** (*Memorandum Usulan Analisa Pembiayaan*) in Word, emails it around, the committee meets and votes on paper, decisions live in inboxes. **~18 days per decision.**

MIZAN replaces this with one place where the loan application lives, the analysis is AI-assisted, the committee records a signed-MoM decision, every action is auto-logged. **Target: <10 days.**

## Domain primer (read before touching code)

- **5C + 1S framework** — every loan application analyzed across:
  - **C**haracter, **C**apacity, **C**apital, **C**ondition, **C**ollateral, **+ Syariah** compliance.
- **Akad types** (Islamic contracts to model):
  - **Murabahah** — cost-plus sale (most common for SME)
  - **Musyarakah** — partnership / profit-loss sharing
  - **Ijarah** — leasing
  - **Mudharabah** — trustee financing
- **MUAP** — the analyst's recommendation memo to the committee. Half MIZAN's value is "make MUAPs faster, more consistent, fully audit-traceable."
- **SLIK** — OJK's national credit bureau lookup (used as input data; v1 ingests via manual upload, not API).

## Core values driving design

| Value | Implication |
|---|---|
| **Amanah** (trust) | Audit trail is non-negotiable |
| **Maslahat** (benefit) | Features must serve a real persona |
| **Syariah-native** | Akad logic baked in, not bolted on |
| **Speed with prudence** | AI assists; humans decide. Never auto-approve. |
| **Human-centered** | "If you need a manual, the design isn't finished" |

## How it flows

Every loan application moves through **6 stages**:

1. **Pengajuan Dokumen** *(RM)* → 2. **Legal, Agunan & Biro** *(RM-coordinated; Legal & Appraisal support + RM bureau data)* → 3. **Feasibility / MUAP** *(RM)* → 4. **Risk Review / RSK** *(Risk Analyst — has veto)* → 5. **Committee Decision** *(Komite)* → 6. **Pencairan** *(RM/Ops checklist)*

After approval, the Pencairan checklist gates release; portfolio monitoring remains out of the current Mizan build. See [WORKFLOW.md](workflow-detail.md).

Send-back between stages is **normal**, not exception. See [WORKFLOW.md](workflow-detail.md) for full detail.

## Stage (as of May 2026)

- ✅ Vision (Manifesto), proposal, and bank review/response complete
- ✅ Scope, stack, timeline, compliance posture **agreed**
- ⏳ Awaiting contract signature → kickoff
- 📅 Target: **8 calendar weeks** from kickoff to Go-Live
- 💰 **Rp 35,000,000 fixed price**

See [SCOPE.md](scope-v1.md), TIMELINE.md, [TECH-STACK.md](tech-stack.md).
