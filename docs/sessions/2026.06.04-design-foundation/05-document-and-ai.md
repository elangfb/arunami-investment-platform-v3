# Document system rethink + AI-assist

The last major arc. Durable homes: `../../designs/document-system.md`, `../../designs/ai-assist.md`,
`../../planning/muap-v2-next-steps.md` (re-scoped).

## Document system — the v2 reversal

The prior v2 design = 644 hand-derived tokens + **bidirectional** NamedRange sync on a live Google Doc.
The user's critique was precise: *"the variable TARGET was wrong, not the count"* — and the fragility
(the whole `lost-in-doc` / sync-back / ID-drift machinery) existed **only to defend bidirectional sync**.

Reversal → **one-way model**:
- **NamedRange = write-once fill anchor.** Mizan fills once (Mizan → Doc); **after the fill the Doc
  belongs to the maker** — edit freely. Mizan stops touching NamedRanges.
- **Drop sync-back + lost-in-doc entirely** (T8/T10).
- **Read-back = Markdown export** (`drive.files.export text/markdown`) for AI analysis — cheaper + more
  faithful than re-OCR'ing our own PDF. (Correcting the user's first idea of PDF→OCR: we own the source,
  so export it directly.)
- **Re-target tokens** to *fillable-from-data* (valuable; still granular, still more than v1's ~16).
- **Keep Google Docs** — Hijra is familiar with it and already subscribes to Google + GCP, so the
  in-region/egress worry I had raised was withdrawn.

## QR signing — the technical reasoning

- Token = **long, crypto-random, unguessable, unique per signature, never reused, permanently scannable**
  (not consume-on-scan — a signed-doc QR must verify forever).
- Placement: `insertInlineImage` **cannot take base64** (URI ≤ 2 kB + must be a Google-fetchable public
  URL). So the QR is rendered by a **free external QR API** (Google fetches the PNG once, stores its own
  copy); the API only ever sees the opaque, no-PII verify URL. Internal auth-walled verify page resolves
  the token → `ApprovalStep`.

## AI-assist — and the kocek borrow

Studied **kocek.ai** (a lighter AI credit-decisioning product) at the user's request — *we will not use
it*, but it validated our posture (5C + white-box reasoning + APPROVE/REJECT/COUNTER-OFFER, "keputusan
tetap di institusi") and gave one idea worth borrowing: **counter-offer** — when a hard-gate fails, AI
computes the plafond/tenor that *would* pass → RM applies via `ReviseProposal`. Cheap (threshold math),
high-value, dovetails with the mutable-proposal design.

Design captured in `ai-assist.md`:
- **Invariant:** AI is advisory-only everywhere — white-box, human-confirms, never sets gating values,
  never frozen into the signed doc, masked + audited.
- **Recommendation points:** RM@MUAP (5C+1S draft · gap · counter-offer · asset-HPP price ref), Risk
  (`aiRiskAdvisory`), Bureau (`bureauSummary`), +Komite/Appraisal/SP3.
- **"Cek harga"** split correctly once we re-verified Appraisal ≠ RM: **collateral valuation sanity-check
  at the Appraisal desk** (auto when value recorded), **asset-HPP price ref at RM@MUAP**, deep
  market-price research = invoke.
- **Document-creation triggers:** MUAP RM-invoke (AI) · RSK auto on Risk-desk entry (AI) · SP3
  approved→auto / conditional→RM-invoke (AI) · MoM invoke (no AI).
- **Fase A AI = RM-invoked.** Principle: **auto at deterministic milestones (RSK on MUAP-final, SP3 on
  approve) · invoke in the fluid phase (Fase A).** Ambient exception: OCR-on-upload is auto.
