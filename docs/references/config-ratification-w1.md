# W1 config ratification register

- **Type:** living register
- **Status:** Living register
- **Last reviewed:** 2026.06.04
- **Provenance / owner:** Mizan engineering (defaults) · **ratifier: Hijra** (RAC Pembiayaan Produktif + Pedoman Komite)
- **Used by:** `lib/hardGates.ts`, `lib/sla-utils.ts`, `lib/komite.ts`, `lib/config/*`, `lib/akad-config.ts`
- **Review / delete trigger:** refresh when Hijra ratifies any value; this register exists so the demo's
  config can be confirmed against Hijra's actual policy. Per the user (2026.06.04): follow existing
  config; where a value is a gap, use Indonesian Sharia-banking common practice as a placeholder.

Every value below is **live config** (the app runs on these), with an admin-editable config layer over
each code default. The **Status** column marks whether the value is a reasonable default or a genuine
gap. **None of these are confirmed against Hijra's policy** — that is the W1 ratification this register
tracks. *Norm* notes general Indonesian Sharia-banking practice (general knowledge; not source-verified —
web verification was unavailable at writing). **Do not treat the norms as authoritative; ratify with Hijra.**

## Hard-gate thresholds — `DEFAULT_RISK_POLICY` (`lib/hardGates.ts`)

| Value | Default | Status | Norm (general, ratify) |
|---|---|---|---|
| DSR max | **40%** | reasonable default | Consumer/productive DSR commonly capped 30–40% of net income. 40% = upper-but-typical. |
| LTV/FTV max | **70%** | reasonable default | OJK/BI FTV caps vary by collateral (property ~70–90%, first vs subsequent). 70% = conservative. |
| Kol max | **1 (Lancar)** | reasonable default | Kol 1 = current/lancar; requiring no NPL history is conservative-standard. |

Admin-editable via `RiskPolicyVersion` (parse bounds: DSR/LTV 1–100, Kol 1–5).

## Komite Pembiayaan

| Value | Default | Status | Norm (general, ratify) |
|---|---|---|---|
| Quorum (min attending) | **2** (`MIN_KOMITE_QUORUM`, `lib/komite.ts`) | assumption | Small-bank/BPRS committees often 2–3 + a chair. Confirm Hijra's quorum + whether the Ketua counts. |
| Composition | CM-role roster, chair per meeting | assumption | Hijra's *Pedoman Komite* defines the standing composition (who must sit, alternates). |
| Decision mechanism | signed MoM, no in-app voting (ADR-0005) | **confirmed** (user 2026.06.04) | — |

## SLA per stage — `SLA_TARGETS_DAYS` (`lib/sla-utils.ts`)

Business days: S1=3, S2=5, S3=5, S4=5, S5=3, S6=5. **Status:** reasonable default. MoM SLA = H+1 business
day (`meetingMomSlaState`). **Gap:** no escalation policy (who is notified / what happens past target) —
ratify with Hijra. Admin-editable via `SlaPolicyVersion` (+ per-desk HK overrides).

## Other config

| Value | Default | Status |
|---|---|---|
| Committee rooms | `['Ruang Komite Lt.5', 'Ruang Meeting A']` (`config/rooms-policy.ts`) | placeholder — Hijra's actual rooms |
| Disbursement conditions | 3 standard conditions (`config/disbursement-conditions.ts`) | reasonable default; admin-editable |
| Akad parameters | margin/nisbah per akad (`lib/akad-config.ts`) | reasonable default; ratify rates with Hijra |

## Genuine gaps (need Hijra policy — NOT invented into the demo)

- **BWMP (Batas Wewenang Memutus Pembiayaan)** — approval-authority tiers by financing amount (branch /
  regional / committee / board). **Not modelled.** The maker-checker ladder + committee enforce a *fixed*
  approval chain regardless of amount; amount-tiered authority needs Hijra's RAC tiers before it can be
  built (deliberately not guessed).
- **DPS scope** — exactly when DPS sharia review (the Stage-5 `dps-review` conditional gate) is
  mandatory vs optional, per akad/structure. Since ADR-0021 (2026.06.12) DPS **no longer signs the RSK
  ladder** — the gate is DPS's only surface, so its trigger condition is now load-bearing syariah
  governance. Ratify the trigger with the DPS + Legal/Compliance (flagged in ADR-0021 §Decision.4).
- **SLA escalation** — notification/escalation chain past an SLA breach.
