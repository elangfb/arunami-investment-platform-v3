# Launch Gates

> Status: Current
> Last reviewed: 2026.06.03
> Source of truth for: production-enable blockers that are not normal app-code completion

Mizan can be code-complete while production enablement remains blocked by legal, compliance,
provider, or ops sign-off. Do not hide these as code TODOs; track owner and evidence here.

## Feature flag posture

- External-egress features stay on safe defaults until the relevant gate is complete.
- Default safe providers: `INFERENCE_PROVIDER=stub`, `WEB_RESEARCH_PROVIDER=stub`, `OCR_PROVIDER=stub` or approved in-region OCR.
- Gemini / web research / offshore OCR are production-disabled unless Bank Legal + Ops sign off.

## Ops gates

| Gate | Owner | Status | Evidence needed |
| --- | --- | --- | --- |
| Seed first `MeetingScheduleTemplateVersion` | Ops / ADMIN-MASTER | Pending live setup | Active template version visible in Admin Master; proposed meetings materialize correctly. |
| Daily materializer cron / worker | Ops | Pending go-live | pg-boss or equivalent worker sidecar deployed, monitored, and restart-safe. |
| Live proposed-agenda smoke | Ops / CM | Pending live setup | Materializer creates proposed meetings with routing reasons; CM confirms one meeting; voting sees it. |
| Live Gemini advisory smoke | Ops / Risk | Pending provider approval | `pnpm verify:documentai` + `scripts/ai-smoke.ts` run green with real ADC (`GOOGLE_CLOUD_PROJECT`+`GOOGLE_CLOUD_LOCATION`): a real generation **and** OCR call succeed and write the `AiInteraction` audit row; no authoritative write. ⚠️ Some Gemini 3.x models serve only from the `global` endpoint — if `asia-southeast1` rejects the model, set the location explicitly and record the working region (the `assertApacLocation` guard already fail-closes non-APAC). |
| Live web-research smoke | Ops / Compliance | Pending legal approval | “Jalankan Riset Web” works only for business entities; citations stored and decision checkpoint freezes them. |

## Legal / compliance gates

| Gate | Owner | Status | Evidence needed |
| --- | --- | --- | --- |
| OJK offshore / cross-border data position | Bank Legal | Pending | Written approval or in-region provider decision. |
| DPIA / PDP assessment | Bank Legal / DPO | Pending | DPIA completed for AI/OCR/web-research egress paths. |
| DPS opinion | DPS / Sharia Compliance | Pending | Opinion covers AI-assisted narrative/advisory and syariah review posture. |
| Vendor DPAs / G5 | Procurement / Legal | Pending | Signed DPAs and vendor risk approval for selected providers. |
| Web-research approval | Compliance | Pending | Allowed source policy and business-only egress classifier accepted. |
| Final inference-provider decision | Product / Compliance / Ops | Pending | Provider choice, region, retention, audit, and fallback documented. |

## Release rule

A feature may be marked **code-built** after typecheck/lint/tests/e2e pass, but it may be marked
**production-enabled** only when every gate above that touches it has owner evidence.
