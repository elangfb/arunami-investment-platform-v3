# Mizan AI eval harness

Two gates, deliberately separate. **Never gate compliance on an LLM judge** — the compliance
invariants are checked by deterministic code that reuses the production seams; the model judge
only ever scores *quality*.

```
┌─ Gate 1: DETERMINISTIC COMPLIANCE  (runs every PR · no network · `pnpm eval`) ──────────┐
│  Reuses prod seams as assertions over golden sets in eval/golden/:                       │
│    • scrubNarrative      → no authoritative output (verdict / risk-level dropped)        │
│    • maskForEgress       → PII masked before egress (known + stray), residual = ∅        │
│    • detectResidualPii   → fail-closed backstop catches a masking miss                   │
│    • token set           → structurally has no level/recommendation key                  │
│  Zero tolerance: any failure blocks the PR. This is the regression that locks G1/G3 +    │
│  the "AI never authors numbers/levels/recommendations" rule before ANY model swap.       │
└─────────────────────────────────────────────────────────────────────────────────────────┘

┌─ Gate 2: QUALITY  (runs at provider cutover · needs a live model endpoint) ──────────────┐
│  Promptfoo (eval/promptfoo) + RAGAS, with a LOCAL judge (no SaaS egress):                │
│    • narrative quality   → pairwise vs current model (anchored rubric, different family) │
│    • grounding           → RAGAS faithfulness/citation ≥ current − ε                     │
│    • OCR                  → per-field F1 + shadow-mode through the OcrProvider boundary   │
│    • red-team            → promptfoo pii / prompt-extraction / hijacking / injection      │
│  The SAME deterministic guards run here too (assert-compliance) so a model that obeys    │
│  the rubric but violates an invariant still fails. This is the gate for the Dec-2026     │
│  in-region swap (Nova / vLLM become a config flip once they pass).                       │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

## Run

- `pnpm eval` — Gate 1. Hermetic; same runner/tsconfig as `pnpm test:unit`. Wired into CI
  (`.github/workflows/ci.yml`, `verify` job) so it runs on every PR.
- Gate 2 is **gated on a model endpoint** (the F1 `INFERENCE_PROVIDER`). It is scaffolded, not
  installed — bring up Promptfoo + a local judge when the in-region endpoint lands:
  `npx promptfoo@latest eval -c eval/promptfoo/promptfooconfig.yaml`.

## Layout

| Path | What |
|---|---|
| `eval/guardrails/compliance.test.ts` | Gate 1 — the deterministic compliance suite |
| `eval/golden/narrative-guardrails.json` | verdict/level cases scrubNarrative must drop / keep |
| `eval/golden/pii-egress.json` | PII strings maskForEgress must remove (known + stray) |
| `eval/golden/injection.json` | injected verdict/level corpus (defense-in-depth + red-team seed) |
| `eval/promptfoo/promptfooconfig.yaml` | Gate 2 scaffold (commented; needs an endpoint) |
| `eval/promptfoo/assert-compliance.ts` | bridge so Gate 2 reuses the SAME prod guards |

## Adding a golden case

Append to the relevant `eval/golden/*.json` (data-only, no code) with a `why`. The suite is
data-driven, so a new case needs no test edits. If a case exposes a guard hole, **fix the guard**
(`server/ai/narrative.ts` / `lib/pii-mask.ts`) — do not weaken the case. (That is exactly how the
`tergolong tinggi` risk-level evasion and the MUAP-vs-RSK level scope were found and resolved.)
