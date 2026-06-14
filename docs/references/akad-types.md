# MIZAN — Akad Types

- **Type:** stable spec (domain) · **Status:** Living register · **Last reviewed:** 2026.06.03
- **Provenance:** merged from `brainstorm/AKAD-TYPES.md` (retired); NoEffort interpretation of Islamic-finance + BPRS practice (📝 W1-confirm).
- **Used by:** `../GLOSSARY.md` akad terms, 5C+1S scoring, MUAP per-akad tables (`muap-template.md`).
- **Review trigger:** Discovery W1 (which akad Hijra offers; nisbah/ujrah conventions).

> **Reconcile:** financial models are model-agnostic domain facts. "LA/RM inputs at Stage X" = role names; as-built roles/desks in `../GLOSSARY.md`.

> Four akad types supported in V1. Akad type drives business logic end-to-end: financial calculation, DSR method, MUAP terminology, collateral treatment, and Syariah assessment angle. **Akad is a proposal parameter, MUTABLE during pre-Komite negotiation** (the bank may counter-offer a different akad/amount); it is **frozen at the Komite decision** and formalized in SP3. Changing the akad after the MUAP is signed voids the signatures → the ladder restarts and required-docs are re-validated. (Supersedes the earlier "set at Stage 1 and immutable".) See `../designs/workflow-engine.md` §"Design principles" (proposal vs workflow).
>
> 📝 All content below is **NoEffort interpretation** based on Islamic finance principles and Indonesian BPRS common practice. Bank confirms at Discovery W1 which akad types Hijra actually offers and their specific product parameters (nisbah ranges, ujrah conventions, etc.).

## Two groups

| Group | Akad types | Fixed installment | `marginRate` | `projectedMonthlyProfitShare` |
|---|---|---|---|---|
| **Flat akad** | Murabahah, Ijarah | ✅ Auto-calculated | ✅ LA inputs | ❌ null |
| **Profit-share akad** | Musyarakah, Mudharabah | ❌ None | ❌ null | ✅ LA inputs manually |

DSR denominator = `proposedMonthlyInstallment` (flat) or `projectedMonthlyProfitShare` (profit-share).

---

## Murabahah

**Concept**: Bank purchases an asset and sells it to the customer at a marked-up price agreed upfront. The sale is complete at akad signing — bank transfers risk and ownership to the customer immediately.

**Key characteristics**:
- Bank **must actually purchase** the asset before selling — if not, the akad is Syariah-invalid
- Sale price (cost + margin) is **fixed at akad signing** and cannot change afterward
- Flat-rate margin applied to original principal (not declining balance) — different from conventional declining-balance interest
- Early settlement: bank cannot unilaterally discount; *ibra'* (voluntary rebate) is permitted as a separate act of goodwill
- Most common akad at Indonesian BPRS (~70–80% of financing volume)

**Installment formula**:
```
totalMargin        = plafond × marginRate × (tenorMonths / 12)
totalObligation    = plafond + totalMargin
monthlyInstallment = totalObligation / tenorMonths
```

**Use cases**: purchase of business equipment, vehicles, raw materials, shop renovation.

**MIZAN specifics**:
- `marginRate`: LA enters at Stage 3 (e.g. `0.12` for 12%/yr)
- DSR: objective — installment is deterministic once inputs are set
- MUAP must record both the bank's purchase price and the selling price to customer as two separate figures

---

## Ijarah

**Concept**: Bank owns an asset and leases it to the customer. Customer pays periodic rental (ujrah). Bank retains asset ownership throughout the lease.

**Two variants**:
- **Ijarah murni**: pure lease — asset reverts to bank at end of term
- **Ijarah Muntahiya Bit-Tamlik (IMBT)**: lease with purchase option at end of term (at nominal/token price agreed upfront). Most common form in BPRS. The ownership transfer at maturity is a **separate akad** (hibah or nominal sale) — not part of the Ijarah contract itself

**Key characteristics**:
- Bank bears asset risk (structural damage, major defects) — unlike Murabahah where risk transfers immediately
- Ujrah can be structured as fixed (common at BPRS for simplicity) or floating (periodic review for long-term contracts)
- IMBT: V1 records as Ijarah; IMBT transfer mechanics are Pencairan/operational, not origination workflow

**Installment formula**: same as Murabahah (see above), with the `ujrah` label in place of `margin`.

**Use cases**: business premises rental, heavy equipment leasing, commercial property (IMBT).

**MIZAN specifics**:
- `marginRate`: used as ujrah rate proxy in V1 (same field, different semantic label)
- MUAP terminology: **"ujrah"** (not "margin") — same calculation, different name
- For IMBT: MUAP should note the end-of-term transfer mechanism even if V1 doesn't model it

---

## Musyarakah

**Concept**: Bank and customer jointly contribute capital to a business venture. Profit is shared according to an agreed **nisbah** (ratio). Losses are shared **proportional to capital contribution**.

**Two variants**:
- **Musyarakah biasa**: bank's capital share is fixed throughout the contract
- **Musyarakah Mutanaqisah (MMQ)**: bank's share diminishes as the customer periodically buys out the bank's portion, until the customer owns 100%. Common for property financing.

**Key characteristics**:
- **No fixed installment** — payment to bank = actual profit share (variable) + principal repayment installment (for MMQ)
- Bank has the right to monitor business operations (because it co-bears risk) — more intrusive than Murabahah
- Nisbah ≠ interest rate: nisbah is the profit-split ratio, agreed independently of capital ratios
- LA must **project** the monthly profit share based on the customer's business revenue projections — this number is inherently judgmental
- DSR based on this projection — less objective than flat akad; LA must document the projection basis in the Capacity analysis narrative

**Example**:
```
Business needs Rp 1B capital
Bank: Rp 700jt (70%), customer: Rp 300jt (30%)
Nisbah agreed: bank 60%, customer 40%

Month with Rp 50jt profit:
  Bank receives: Rp 30jt
  Customer retains: Rp 20jt

Month with Rp 10jt loss:
  Bank absorbs: Rp 7jt (70% of loss)
  Customer absorbs: Rp 3jt
```

**Use cases**: working capital, business expansion, project financing.

**MIZAN specifics**:
- `projectedMonthlyProfitShare`: LA inputs manually at Stage 3 — estimated monthly profit-share obligation to the bank
- DSR = `(existingObligations + projectedMonthlyProfitShare) / netMonthlyIncome`; the gate is judgmental — LA's Capacity narrative must justify the projection basis
- MUAP must include: bank capital, customer capital, nisbah, and the basis for revenue projection
- Syariah +1S: assess whether the business purpose is halal, the nisbah is fair, and the monitoring mechanism is in place

---

## Mudharabah

**Concept**: Bank provides **100% of the capital** (shahibul maal). Customer provides **100% expertise and management** (mudharib). Profit is split by nisbah. Losses are borne **entirely by the bank** — except in cases of customer negligence or fraud.

**Key difference from Musyarakah**:

| | Musyarakah | Mudharabah |
|---|---|---|
| Bank capital | Partial (e.g. 70%) | 100% |
| Customer capital | Partial (e.g. 30%) | 0% (expertise only) |
| Loss borne by | Proportional to capital | Bank bears all |
| Business control | Joint | Customer manages; bank cannot interfere |

**Key characteristics**:
- Bank **cannot participate in management** — it only provides capital; operational decisions belong to the customer
- Bank's risk exposure is highest among the four akad types — this is why Mudharabah is rare for direct BPRS financing to UMKM (more common in deposit/savings products)
- Proving customer negligence (to claim loss recovery) is legally difficult — adds operational risk
- Syariah assessment is more critical for Mudharabah: must clearly establish the customer's expertise scope, management boundaries, and audit/reporting mechanism

**Example**:
```
Bank provides Rp 500jt (100%)
Customer provides expertise (0% capital)
Nisbah: bank 55%, customer 45%

Month with Rp 40jt profit:
  Bank: Rp 22jt, Customer: Rp 18jt

Business loses Rp 100jt (no negligence):
  Bank absorbs entire Rp 100jt
```

**Use cases**: specific project financing with customers who have strong track records; less common than Musyarakah.

**MIZAN specifics** (data-model fields and DSR formula are identical to Musyarakah):
- MUAP: must document why the bank trusts the customer's expertise (since bank bears 100% capital risk); stronger justification bar than Musyarakah
- Syariah +1S: stricter assessment — document expertise scope, management boundaries, fraud/negligence definitions, and reporting obligations

---

## Full MIZAN data-model matrix

| Field | Murabahah | Ijarah | Musyarakah | Mudharabah |
|---|---|---|---|---|
| `marginRate` | ✅ LA inputs | ✅ as ujrah proxy | ❌ null | ❌ null |
| `proposedMonthlyInstallment` | ✅ auto-calc | ✅ auto-calc | ❌ null | ❌ null |
| `projectedMonthlyProfitShare` | ❌ null | ❌ null | ✅ LA inputs | ✅ LA inputs |
| DSR method | Objective | Objective | Judgmental | Judgmental |
| Bank bears asset risk | ❌ | ✅ during lease | ✅ proportional | ✅ full |
| Nisbah required | ❌ | ❌ | ✅ | ✅ |
| MUAP term for bank's return | "margin" | "ujrah" | "nisbah bagi hasil" | "nisbah bagi hasil" |
| Relative frequency at BPRS | ⭐⭐⭐ dominant | ⭐⭐ common | ⭐⭐ common | ⭐ rare |

---

## Akad-type impact on analysis (5C+1S)

### Capacity
- **Flat akad**: DSR is deterministic. Capacity narrative documents the numbers and whether they pass the >40% threshold.
- **Profit-share akad**: DSR depends on projected profit-share. Capacity narrative must justify the projection — revenue history, market conditions, comparable businesses.

### Collateral
- **Murabahah**: bank has no ongoing ownership of the financed asset (sold to customer). Collateral is separate from the financed asset.
- **Ijarah**: the leased asset itself is bank-owned — it is implicitly collateral. Additional collateral may still be required.
- **Musyarakah/Mudharabah**: bank's capital is at risk. Collateral is negotiated — may be difficult to obtain since the business is a joint venture.

### Syariah (+1S)
- **All akad**: verify the financed purpose is halal (no prohibited goods/services).
- **Murabahah**: verify the bank actually purchased (or will purchase) the asset before sale.
- **Ijarah**: verify the leased asset is a real, usable asset (not a financial instrument).
- **Musyarakah**: verify nisbah is agreed and fair; verify monitoring mechanism exists.
- **Mudharabah**: strictest — verify expertise scope, management boundaries, and loss/negligence definitions. Document fully in MUAP.

---

## Open questions for Discovery W1

- [ ] 🟡 Which akad types does Hijra actually offer? (All four, or a subset?)
- [ ] 🟡 Nisbah ranges — what nisbah is typical/acceptable for Musyarakah and Mudharabah at Hijra?
- [ ] 🟡 Ijarah: does Hijra use IMBT or pure Ijarah? What is the standard end-of-term transfer mechanism?
- [ ] 🟡 Musyarakah Mutanaqisah: is MMQ offered? If so, how is the buyout schedule structured?
- [ ] 🟢 Mudharabah: is it offered for direct UMKM financing, or only for deposit products?
- [ ] 📝 V1 uses `marginRate` as ujrah proxy for Ijarah — Bank confirms if separate ujrah rate field is needed, or if the proxy is acceptable for V1.
