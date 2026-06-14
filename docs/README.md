# Mizan Docs

> Status: Current
> Last reviewed: 2026.06.10
> Source of truth for: documentation navigation and ownership

> **🧭 North Star — Mizan = neraca tepercaya** (ميزان: timbangan/keadilan). Mizan **menimbang & mengingat**
> sebuah proses pembiayaan manusia — **ia tidak menyetir**. Tim (RM↔Legal↔Appraisal↔Risk↔Komite) menjalankan
> deal lewat kolaborasi cepat & informal; Mizan mengingatnya sempurna (append-only, tak terhapus) dan
> membuktikannya ke regulator. Nilainya = **ingatan tepercaya + akuntabilitas, bukan kontrol** — **kalau
> Mizan memperlambat, ia gagal.** Filter tiap keputusan: *bikin Mizan jadi neraca/ingatan yang lebih
> tepercaya & lancar → lakukan; bikin jadi pengontrol/penghambat → tolak.* Prinsip turunan + 6 pilar:
> [`designs/workflow-engine.md`](designs/workflow-engine.md) §"Design principles".

Use docs by lifecycle:

- `CURRENT-STATE.md` — live facts/limitations true right now (read first to orient); not roadmap/backlog.
- `guides/` — human-facing source-of-truth for coding, operating, and reviewing the app (use `_templates/` for new guides).
- `planning/` — **active-only** in-flight work plans. A plan exits here when shipped (promote/digest/delete).
- `designs/` — durable system blueprints and conventions (promoted from planning when the content outlasts the build); [`designs/README.md`](designs/README.md) indexes current vs historical.
- `references/` — standing consulted material / living registers with owner/review metadata.
- `decisions/` — accepted/superseded ADRs that explain why major choices were made.
- `sessions/` — backward records of substantial thinking sessions worth preserving; not task logs.
- `handoffs/` — forward continuation batons for non-trivial unresolved work; retire when consumed.
- `MEMORY.md` — slim, one line per entry: cross-session reusable learnings/gotchas; not status/history.

## Start Here

| Need | Read |
| --- | --- |
| Know what "done" means for a feature (1 sumber kebenaran + 1 kalimat acceptance) — read BEFORE building/reviewing | `references/feature-acceptance.md` |
| See what's built / true right now | `CURRENT-STATE.md` |
| Recall a past learning / gotcha / decision rationale | `MEMORY.md` |
| See how a decision evolved · cross-session contradictions · doc-vs-shipped drift audit | `references/session-history/README.md` |
| Understand a domain term (nasabah, MUAP, kol, akad, desks…) | `GLOSSARY.md` |
| Understand app architecture | `guides/architecture.md` |
| Change workflow, desks, or gates | `guides/workflow.md` + `decisions/` |
| Confirm core workflow with Finance (Bahasa) | `guides/alur-kerja-inti.md` |
| Review external services & data egress (compliance) | `guides/layanan-eksternal.md` |
| Change application detail UI | `guides/detail-page.md` + load the `mizan-design` skill |
| Deploy or operate on-prem | `guides/deployment.md` |
| Configure Document AI OCR | `guides/document-ai-ocr.md` |
| Configure Google Docs OAuth (MUAP/RSK) | `guides/google-docs-oauth.md` |
| Apply Mizan's Google Docs templating lessons to another project | `guides/google-docs-templating-field-guide.md` |
| Track app-completeness go-live checklist | `guides/deployment.md` |
| Track production-enable blockers (legal/compliance/ops sign-off) | `guides/launch-gates.md` |
| Understand why the write-layer / desk model is shaped this way | `decisions/0001-write-layer-server-authoritative.md`, `decisions/0002-phase3-solo-decisions.md`, `decisions/0003-workflow-target-and-rbac.md` |
| Understand why the 6→4 workflow target, desk/role model & Mizan scope boundary are shaped this way | `decisions/0003-workflow-target-and-rbac.md` |
| Understand why the workflow engine is command-sourced (not event-sourced) | `decisions/0004-workflow-engine-command-sourced.md` |
| Understand why Rapat Komite is signed-minutes (no in-app voting) | `decisions/0005-rapat-komite-signed-minutes.md` |
| Understand why RM administers Rapat Komite via a separate `komite-admin` desk | `decisions/0015-komite-admin-desk-rm-managed-sessions.md` |
| Understand the shipped RM-led maker-checker workflow (as-built) | `designs/workflow-target.md` + `guides/workflow.md`; the deferred engine 6→4 renumber is noted in `designs/workflow-engine.md` |
| Understand the workflow engine architecture (commands · ledgers · snapshot) | `designs/workflow-engine.md` |
| See the target end-to-end flow + the ordered change roadmap (master sequence tying the PROPOSED notes) | `planning/target-flow-roadmap.md` |
| Consider the proposed Origination-as-one-RM-phase + Legal/Appraisal-as-review redesign (PROPOSED, not built) | `designs/origination-phase-legal-as-review.md` |
| Understand the document system (template fill · QR signing · read-back) | `designs/document-system.md` |
| Understand the V3.5 targeted-NamedRange fill for underscore slots (plafond/tenor — SHIPPED Batch 4, 2026.06.10) | `designs/doc-fill-v3.5-namedrange.md` |
| Understand per-stage doc lifecycle — exactly-one-editable + freeze-on-advance (shipped; §1's MUAP half slated for reversal by ADR-0018) | `decisions/0016-per-stage-doc-lifecycle-one-editable.md` |
| Understand why MUAP becomes editable throughout Inisiasi — implemented, merged to `main` 2026.06.12 | `decisions/0018-muap-editable-early.md` |
| Understand the open-read / scoped-write access model + Mizan-owned generated docs — implemented, merged to `main` 2026.06.12 | `decisions/0019-open-read-scoped-write-access.md` |
| Understand the Customer entity + RM-led pipeline-over-`stage`-Int model — implemented, merged to `main` 2026.06.12 | `decisions/0020-customer-entity-and-rm-led-pipeline.md` |
| Read the RM-led pipeline redesign blueprint (BUILT P1–P5, merged 2026.06.12; residuals in the execution queue) | `designs/rm-led-pipeline-redesign.md` |
| Work the post-merge priority queue (docs · pending dev · offering-claim gaps) | `planning/execution-queue.md` |
| Understand AI assist (recommendation points · counter-offer · invariant · doc triggers) | `designs/ai-assist.md` |
| Continue config/admin work | `planning/config-and-admin.md` |
| Workflow fine-tune (shipped + ops remainder) | `designs/workflow-finetune.md` §0 |
| Plan realtime notifications (DEFERRED — V1 polls; built later) | `planning/realtime-notifications-sse.md` |
| Find a doc template's live ID / token set / authoring script | `references/document-templates.md` |
| Tokenize a future master Doc | `designs/muap-v2-tokenization-playbook.md` (§Coverage gate) |
| Understand the MUAP/RSK v2 tokens | `designs/muap-template-engine-v2.md` + `designs/muap-v2-tokenization.md` (historical) + `designs/rsk-v2-tokenization.md` (historical) |
| Find a deferred AI/ML item | `references/ai-ml-deferred.md` |
| Understand the financing domain (BPRS, akad, 5C+1S) | `references/project-overview.md`, `references/akad-types.md` |
| Read the workflow long-form detail / confirmed target | `references/workflow-detail.md` (detail) · `designs/workflow-target.md` (6→4 target, gate open) |
| See committee mechanics (BWMP, voting, conditional) | `references/komite-mechanics.md` |
| Look up regulatory facts (POJK 34/2025, UU PDP §56, DPA) | `references/compliance.md` |
| Understand the PII masking design | `designs/pii-masking.md` |
| Understand the admin/config layer design | `designs/admin-config-layer.md` |
| Read the Stage-1 required-docs matrix | `references/required-docs-matrix.md` |
| Look up per-desk SLA targets (Bank SOP) | `references/sla-targets.md` |
| Read personas & supporting desks | `references/personas.md` |
| See the MUAP document layout (sections I–IX) | `references/muap-template.md` |
| Read Bank SOP evidence + source artifacts | `references/hijra-bank-sop-digest.md`, `references/sources/` |
| Check Discovery W1 open questions | `references/discovery-open-questions.md` |
| Confirm agreed tech stack & standards | `references/tech-stack.md` |
| Check v1 scope-of-work · Kanban model | `references/scope-v1.md` · `references/kanban-model.md` |

## Doc Rules

- Keep `guides/` current and concise. They should describe how the system works now, not narrate how it got there.
- Keep active plans in `planning/`. A plan closes by promoting durable truth/rationale/design to the right layer, digesting then deleting, or deleting; git is the archive.
- Keep ADRs in `decisions/` accepted/superseded only. Proposed trade-offs stay in planning/session notes until accepted.
- Use `YYYY.MM.DD` for dates in docs and dated doc paths.
- Do not add new root-level handoff docs. Put continuation batons under `docs/handoffs/<YYYY.MM.DD-slug>/README.md`; include a retire condition and remove/digest when consumed.
- Do not track session-by-session progress in planning docs. Fold status into the canonical plan's §0 instead; use `docs/sessions/<YYYY.MM.DD-slug>/README.md` only for substantial thinking-session records worth preserving.
- Add to `MEMORY.md` only when no better layer owns the fact, it is reusable across sessions, and future agents may repeat a costly mistake without it.
