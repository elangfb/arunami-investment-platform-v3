# Follow-ups (non-active candidates)

Active, committed build work is **not** here — it lives in planning:
- Document/AI build slice: `../../planning/muap-v2-next-steps.md` §"Current iteration" (D1–D6).
- Workflow engine build: `../../planning/workflow-rm-maker-checker.md` (slice-0 → phases).

Non-active candidates / pending inputs surfaced this session:

- **W1 Hijra values** (credit policy — not in any source we have; need RAC Pembiayaan Produktif + Pedoman
  Komite): DSR/LTV/Kol thresholds · BWMP tiers · Komite composition/quorum/voting · akad product params ·
  DPS exact review scope · SLA-breach escalation targets. → `../../references/discovery-open-questions.md`.
- **MoM + SP3 Google Doc access** — templates are auth-walled; the app OAuth can read them via the scan
  script, but they need NamedRange setup + registries. Blocks D6.
- **External QR API** — fine for demo; production may self-host a Google-reachable QR endpoint or upload a
  locally-generated QR to Drive (avoids the third-party dependency).
- **Markdown-export fidelity** — verify table/structure fidelity on a real MUAP before relying on it for
  AI analysis (5-min spike).
- **Optional AI recommendation points** — Komite deal-briefing, Appraisal valuation sanity-check, SP3
  draft — confirm whether each is in the demo scope.
- **Legal calls (production-gating, not build):** DPIA for the AI credit memo; DPS blessing the AI-assisted
  workflow; G5 web-research production gate. → `../../references/ai-ml-deferred.md`.
- **Brainstorm repo retirement** — **DONE 2026.06.05**: two-session collaboration retired; this repo is canonical; `../brainstorm/` left as an inert archive.
