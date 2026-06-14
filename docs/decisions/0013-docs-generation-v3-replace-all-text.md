# ADR-0013: Docs generation V3 — registry-scoped `replaceAllText`, value-or-original-placeholder

- **Status:** accepted
- **Date:** 2026.06.08
- **Supersedes:** the V2 NamedRange tokenization approach (`designs/document-system.md` V2 fill section; `designs/muap-v2-tokenization.md`, `muap-v2-tokenization-playbook.md`, `rsk-v2-tokenization.md`, `muap-template-engine-v2.md`).

## Context

MUAP/RSK Google-Doc generation went through two unsatisfactory shapes:

- **V1** mapped only ~16 facts onto `f_*` NamedRanges → docs were mostly empty.
- **V2** went to a **644-token NamedRange registry** with a per-master setup script. It was **unmaintainable**, suffered a **duplicate-token leak** (a NamedRange wraps only the first occurrence; repeated fields like plafond stayed `{{plafond}}` elsewhere), required a **fragile OAuth setup pass**, and — critically — **was never wired into `createApplicationDocs`** (`seedApplicationDocV2` is orphaned). Per-app creation still ran V1, so the V2-tokenized masters leak raw `{{tokens}}` to users (e.g. `{{plafond}}`, `{{tenor_in_bulan}}`).

A clean scripted V2→V3 de-tokenization is **not** fully possible: the `TemplateReferenceText` cache (the only stored source of each token's original placeholder) is **partial and partly passthrough** — MUAP 160/376, RSK 64/106, and some entries are the token literal itself.

Requirements that emerged: (1) a user must **never** see a raw `{{...}}` — only a value or the document's own human placeholder; (2) variables only for **what Mizan actually knows** (V1 too few, V2 too many); (3) wire per-token AI narrative.

## Decision

1. **Curated "Mizan-known" registry** (`lib/templates/doc-registry.ts`): facts (from `SeedContext`) + masked AI narratives + signing dates — ~38 vars (vs V1's 15 / V2's 644). Gating fields (risk level, recommendation, committee verdict, approved terms) are **excluded by design** and guarded by `assertSafeTokens`.
2. **Each var is a UNIQUE bracketed placeholder** in the master (e.g. `[Plafond yang Diajukan]`) — it is BOTH the resting state and the `replaceAllText` target. **No `{{}}` syntax exists in V3 masters.**
3. **Fill** (`server/docs/seed.ts` `fillApplicationDoc`): `replaceAllText("[Label]", value)` only when Mizan knows the value; otherwise leave the placeholder. **Value-or-original-placeholder → leak-proof by construction**; duplicate occurrences all resolve in one request. Backstop: a post-fill residual-`{{` sweep (`assertNoLeftoverTokens`).
4. **NamedRanges only for QR/signature anchors** (`insertInlineImage` needs a location). All value/narrative text uses `replaceAllText` — this removes the V2 NamedRange setup + dup-coverage burden entirely.
5. **AI narrative per-token** (resolver reads the masked generator output keyed by var name; never gating).
6. **Signing date** (`tanggal_muap`, `tanggal_rsk`) is filled **only once the approval ladder is fully signed** (`chainState === 'complete'`), with the **last (completing) signature's date** — not `now`, not the first signature. Until then it resolves `null` → the placeholder stays. (`tanggal_pengajuan` is distinct: submission date, known at creation.)
7. **`seed.ts` is the single module.** `seed-v2.ts`, `buildFactMap`, and the NamedRange setup scripts are retired at cutover.

## Consequences

- **Simpler and maintainable** — deletes the V2 NamedRange setup/dup machinery; the leak class is eliminated structurally.
- **Masters must be (re)authored to the V3 placeholder form.** Because the reference-text cache is too partial to script a clean V2→V3 conversion, the V3 base is the **RAW reference templates** (original `[brackets]` for every slot; **decided 2026.06.08**); the ~38 Mizan-known fields get a unique `[Label]` authored on top (unique-placeholder fields scriptable; duplicated-placeholder fields need manual placement). OAuth authoring on live docs, gated. Concrete master Doc IDs live in the register [`../references/document-templates.md`](../references/document-templates.md), not here.
- **Narratives render as single-block text** (`replaceAllText` can't structure paragraphs) — accepted; structure-preserving insertion deferred. (As built, the MUAP/RSK masters keep their own granular human-fill narrative prompts; AI narratives are filled in-app, not stamped into the Doc — see `../designs/document-system.md`.)
- Supersedes the V2 tokenization design + walkthroughs; the design "how" is `../designs/document-system.md` and the live facts are in the register above.

## Follow-on (2026.06.08, same decision line)
- **QR signature anchors created.** The seven signature-slot NamedRanges `stampSignatureQr` targets (MUAP `tanggal_ttd_{rm,tl_spv,bm_ku}`, RSK `rsk_sig_{analyst,officer,cro}_tanggal` + `rsk_dps_tanggal`) were authored on the masters and verified — QR stamping is live on every approval rung. (NamedRanges-for-QR-only is point 4 of this decision.)
- **MoM/SP3 share the principle, different convention.** MoM/SP3 are *not* `[bracket]` docs: they keep the simpler **`{{token}}` literal + `replaceAllText` (value-or-`—`)** mechanism (`lib/mom-sp3-tokens.ts`), with maker-fill fields as `[human placeholder]`. Their masters were de-customized from the real filled reference docs and proven leak-free by a denylist scan. The shared invariant — *a user never sees a raw machine token* — holds for both families. Detail: `../designs/document-system.md`.
