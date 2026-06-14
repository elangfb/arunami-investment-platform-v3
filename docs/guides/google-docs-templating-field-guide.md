# Google Docs templating field guide — lessons from Mizan MUAP/RSK

> Status: Current
> Last reviewed: 2026.06.11
> Audience: engineers or agents applying Mizan's Google Docs templating lessons to another project

## Purpose

This guide captures the transferable knowledge from Mizan's Google Docs templating system so another project can design, build, or review a similar document-generation pipeline without inheriting the same mistakes.

**Source system:** Mizan generates financing documents in Google Docs. The two highest-stakes examples are **MUAP** (*Memorandum Usulan Analisa Pembiayaan*, the financing proposal memo) and **RSK** (*Risk Summary Komite*, the risk review memo). Both are edited by humans in Google Docs, signed through Mizan's maker-checker ladder, and frozen to PDF for audit.

**Scope for another project:** use this when you need a human-editable Google Docs template that an app copies, fills, shares, signs, reads back, and freezes. This is not limited to banking, but the caveats are shaped by Mizan's compliance-grade MUAP/RSK use case.

**Verification level for this guide:** source-audit only. The guide was written from current Mizan docs, code, tests, and a medium-tier pi audit; no live Google Docs smoke was run in this batch. Phrases like “Built in Mizan” mean “present in current source/docs,” not “freshly live-smoked today.”

## Executive summary

If you only copy one pattern, copy this one:

1. **Keep Google Docs as the human editing surface.** Treat generated Docs as per-case copies of an app-owned master.
2. **Use human placeholders as machine anchors.** A slot should rest as a valid human prompt such as `[Nama Perusahaan Pemohon]`, not a raw machine token like `{{customer_name}}`, unless you can guarantee it is always replaced before a user sees it.
3. **Fill one-way.** The app fills known facts once; the maker owns the Google Doc after that. Do not build an authoritative Doc→DB sync unless you are ready for conflict resolution and audit ownership.
4. **Use `replaceAllText` for normal text slots.** It replaces every identical occurrence, so the target text must be unique unless all occurrences should receive the same value.
5. **Use NamedRanges only for hard anchors.** Examples: signature QR slots, extraction anchors, and underscore blanks such as `Rp ____,-` that cannot be safely targeted by text replacement.
6. **Freeze the audit artifact as a PDF.** A Google Doc is a live collaborative object; even if you revoke writer access, the audit record should be an immutable exported copy with a hash.
7. **Prove the master, not just the code.** Most failures are registry-vs-master drift: the code knows a token the master does not have, or the master has a blank the code cannot fill.

## Recommended architecture

### Built in Mizan

Mizan's current architecture is:

```text
master Google Doc
  └─ Drive files.copy → per-application Google Doc
       ├─ fill pass 1: replaceAllText on unique [bracket] placeholders
       ├─ fill pass 2: targeted NamedRange fill for hard underscore slots
       ├─ human edits in Google Docs
       ├─ QR stamping at signature NamedRanges
       ├─ optional advisory read-back
       └─ committee decision freeze → PDF + SHA-256 audit checkpoint
```

Key source paths in this repo:

- Current live summary: [`../CURRENT-STATE.md`](../CURRENT-STATE.md)
- System design: [`../designs/document-system.md`](../designs/document-system.md)
- V3.5 NamedRange fill design: [`../designs/doc-fill-v3.5-namedrange.md`](../designs/doc-fill-v3.5-namedrange.md)
- Live template register: [`../references/document-templates.md`](../references/document-templates.md)
- Registry: [`../../apps/web-app/src/lib/templates/doc-registry.ts`](../../apps/web-app/src/lib/templates/doc-registry.ts)
- Fill engine: [`../../apps/web-app/src/server/docs/seed.ts`](../../apps/web-app/src/server/docs/seed.ts)
- Copy/freeze/read-back service: [`../../apps/web-app/src/server/docs/service.ts`](../../apps/web-app/src/server/docs/service.ts)

### Transferable design rule

Separate these concerns explicitly:

| Concern | Recommended owner | Why |
|---|---|---|
| Master template wording and layout | Business owner / document owner | The Doc format is usually regulatory or customer-facing. Engineers should not “clean up” labels casually. |
| Fillable variable registry | App code | Needs tests, type checks, and review. |
| One-time master authoring scripts | App/tooling code | Google Docs index ranges are fragile; scripts must be dry-run, backup-first, and verified. |
| Per-case copy and fill | Server-side app code | Requires credentials, audit, retries, and PII controls. |
| Human editing | Google Docs | Users already understand it; Google handles collaborative editing. |
| Frozen audit copy | App/object storage | Google revision history is not a durable audit system. |

## Placeholder strategy

### Pattern A — unique human `[bracket]` placeholders

**Best default for user-facing templates.**

Example master text:

```text
Nama Nasabah: [Nama Perusahaan Pemohon]
Akad: [Jenis Akad]
Plafond: Rp ____________,- ([Plafond Terbilang])
```

Example fill rule:

```text
replaceAllText("[Nama Perusahaan Pemohon]", "PT Contoh Sejahtera")
```

Why this works:

- If the app knows the value, the placeholder becomes the value.
- If the app does not know the value, the placeholder remains a valid human prompt.
- A user never sees raw implementation syntax.
- Duplicate occurrences are safe **only when all occurrences should receive the same value**.

Mizan's implementation: `doc-registry.ts` defines the placeholder, template scope, kind, and method; `seed.ts` resolves and fills it.

### Pattern B — `{{token}}` machine tokens

Use this only when the document is not shown to users until every token is replaced, or when the engine replaces missing values with a safe fallback such as `—`.

Mizan uses this for MoM/SP3, not for MUAP/RSK. Those masters were de-customized from real filled reference Docs, and the authoring script scans a denylist to prove no example-customer data survived.

Caveats:

- A leaked `{{token}}` looks like a software bug, not a human prompt.
- `{{token}}` is risky in high-stakes templates unless you run a residual-token check after fill.
- If you keep hidden sentinels such as `${{field_name}}`, your token scanner must not flag them as leaks by accident.

### Pattern C — targeted NamedRanges

Use a **NamedRange** when text replacement has no safe text anchor.

Mizan uses this for seven MUAP hard slots:

- No. MUAP on cover and identity section
- Tanggal on cover and identity section
- Plafond in the facility table and recommendation section
- Tenor

These slots are underscore/composite blanks such as:

```text
Rp ____________,-
___ Bulan
______/MUAP-MKT/___/20___
```

`replaceAllText` cannot know which underscore run is the right one. A NamedRange can wrap the exact run once on the master; runtime fill reads that range, deletes the content, inserts the value, and verifies the value landed.

NamedRange caveats:

- **One range per occurrence.** Do not use one NamedRange for a repeated concept and assume every occurrence fills. That was a Mizan V2 failure class.
- **Prove ranges survive `files.copy`.** Mizan spike-tested this before shipping V3.5.
- **Do not scale this to hundreds of variables.** Mizan's 644-token NamedRange design was unmaintainable.
- **Ranges are master metadata.** A re-authored master version must recreate them.
- **Runtime indexes shift.** Re-read the Doc before each index-sensitive operation, or apply deletes in descending order.
- **Google Docs ranges use exclusive `endIndex`.** Table-cell terminal newlines are easy to delete illegally; keep scripts conservative.

## Fill pipeline

### Built in Mizan

Mizan's fill engine has two passes:

1. **Placeholder pass:** batch `documents.batchUpdate` with `replaceAllText` requests for every known non-empty value.
2. **NamedRange pass:** for each targeted hard slot, re-read the NamedRange, run `deleteContentRange` + `insertText`, then read back the Doc body and verify the inserted value exists.

The resolver returns `null` when Mizan does not know a value. `null` means “leave the placeholder intact,” not “write blank.”

### Recommended implementation contract

Each variable should declare:

```ts
type TemplateVariable = {
  name: string                 // internal resolver key; never shown in Doc
  placeholder: string          // `[Human Label]` target for replaceAllText
  templates: Array<'muap' | 'rsk' | string>
  kind: 'fact' | 'narrative' | 'signing-date'
  method?: 'placeholder' | 'namedRange'
  namedRange?: string          // required if method === 'namedRange'
}
```

Test the registry:

- Placeholder variable names are unique.
- Placeholder texts are unique and bracketed.
- NamedRange names are unique per occurrence.
- Every variable targets at least one template.
- No forbidden/gating concept appears in a writable variable name.

## What not to fill

High-stakes values should be excluded from the template-fill registry when they must be authored or approved by a human.

Mizan blocks variables whose names smell like:

```text
level
recommend / rekomendasi
verdict
keputusan
setuju / tolak
approved terms
```

Reason: MUAP/RSK AI and deterministic fill may draft supporting prose, but the official risk level, recommendation, committee verdict, and approved terms are human authority. This is enforced by `assertSafeTokens` in the fill path and by tests.

Transferable rule:

> If a value changes workflow authority, legal meaning, credit decision, pricing, or audit responsibility, do not let a background fill engine write it unless the product explicitly says the system is the authority.

## AI narrative slots

### Built in Mizan

Mizan can generate AI prose for MUAP 5C+1S analysis slots. The MUAP master carries labelled editable paragraphs:

```text
📝 Draf analisa AI (sunting/lengkapi sebelum finalisasi): [Analisis Character]
```

The label is part of the control: the analyst sees this as a draft to edit, not a final model-authored opinion.

Compliance controls:

- Facts and numbers are filled deterministically, not by the model.
- The model receives masked input where applicable.
- Structured output is keyed by the allowed narrative tokens only.
- A scrubber drops narrative fields that smuggle risk levels or decision verdicts.
- The analyst remains the author of the final frozen Doc.

Caveats:

- AI prose in the body creates anchoring risk: humans may rubber-stamp it. Label it clearly and require review before freeze.
- `replaceAllText` inserts plain text, not rich multi-element Doc structure. Use it for single-block prose unless you are ready to manage `insertText`, paragraph styles, lists, and tables.
- Mizan's current MUAP has AI narrative slots; RSK narrative slots are not stamped into the RSK master as authoritative risk text.

## Master authoring workflow

### Recommended process

1. **Start from the real business template.** Preserve labels, table structure, and wording unless the document owner approves a change.
2. **Inventory the master via the Google Docs API JSON.** Do not use PDF/vision as the source of index truth; `documents.get` gives body structure and `startIndex`/`endIndex`.
3. **Build a coverage matrix.** For each slot: label, intended variable, fill method, current status, and whether it is human-authored or app-known.
4. **Author only the app-known slots.** Do not tokenize every blank.
5. **Dry-run every master mutation.** Print planned replacements/ranges.
6. **Backup first on apply.** Use `files.copy` before mutating the live master.
7. **Verify after apply.** Re-read the Doc and assert every expected placeholder/range exists.
8. **Record the backup ID and re-author tax.** A new master version must rerun the setup scripts.

### Useful Mizan script patterns

- `audit-master-coverage.ts` walks Docs JSON and inventories `[bracket]` tokens, underscore blanks, and NamedRanges.
- `author-v3-raw-masters.ts` replaces specific placeholder occurrences by row context, not global search, so generic prompts do not cross-fill.
- `setup-v35-namedranges.ts` creates NamedRanges over hard underscore slots, backup-first and verify-after.
- `place-narrative-slots.ts` inserts labelled AI narrative placeholders and normalizes paragraph style.
- `author-momsp3-masters.ts` de-customizes real filled reference docs and denylist-scans example-customer data.

Transferable caveat: **re-authoring a Google Doc master is not a pure code change.** Treat it like a migration: dry run, backup, apply, verify, update the template register, and smoke test a copied document.

## Google Docs API gotchas

| Gotcha | Practical rule |
|---|---|
| `replaceAllText` replaces all matching occurrences | Use unique placeholders, or only reuse placeholders when every occurrence gets the same value. |
| `replaceAllText` is not a rich layout engine | Use it for scalar values and simple prose; use index-based insert/style requests for rich content. |
| Tables require recursive traversal | A body-only text walk misses table cells. Walk `paragraph` and `table.tableRows[].tableCells[].content`. |
| Indexes shift after edits | Re-read before each index-sensitive operation, or batch deletes from high index to low index. |
| `endIndex` is exclusive | Range `[startIndex, endIndex)` deletes/inserts exactly that slice. |
| Table cells have terminal newlines | Deleting the last newline can fail. Scripts should avoid deleting cell terminators. |
| NamedRanges are metadata, not magic | They can be absent, deleted by users, or stale after master re-authoring. Verify. |
| `insertInlineImage` needs a URL Google can fetch | Base64 data URIs are not viable for QR images; use a fetchable URL with no PII in it. |
| Drive `files.copy` does not solve sharing by itself | The copied Doc may be private to the app account unless you grant/share it. |

## OAuth, Drive ownership, and access

### Built in Mizan

Mizan uses OAuth with a **dedicated Google account** as the Docs/Drive identity. The server reads `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, and `GOOGLE_OAUTH_REDIRECT_URI` to build Google Docs and Drive clients.

Why not a Service Account in Mizan's current setup:

- A Service Account has no normal My Drive storage quota.
- `files.copy` can fail with storage/quota errors unless you use a Workspace Shared Drive or a user-owned parent folder.
- A dedicated single-purpose Google account made full `drive` scope acceptable because “all of Drive” means “all of Mizan's app-owned docs.”

Transferable recommendation:

- If your organization has Workspace and Shared Drives, evaluate Service Account + Shared Drive.
- If you use a dedicated account, treat it as production infrastructure: vault the password, enable 2FA with team custody, monitor quota, and rotate/re-consent refresh tokens when needed.
- Avoid `drive.file` if templates are hand-created in Drive UI; it can 404 on files the OAuth app did not create or picker-share.

### Sharing model caveat

A copied Doc is usually private to the owner identity unless permissions are set. Mizan currently grants per-user access just in time, and has an accepted but not-yet-implemented move toward broad folder read access for future flow. For another project, choose one model deliberately:

| Model | Good for | Caveat |
|---|---|---|
| Per-email grants | PII-heavy docs, least-privilege access | More API calls, request-access wall if grants fail, requires email mapping. |
| Folder/Shared Drive read access | Internal open-read collaboration | Wider exposure; must scope writes separately. |
| Anyone-with-link | Low-risk docs only | Usually unacceptable for PII, regulated, or customer documents. |

Use `/preview` for embedded read-only iframes; `/edit` is for opening a new Google Docs tab.

## QR signing and signature slots

### Built in Mizan

Mizan stamps QR images into signature NamedRanges. The QR payload is an opaque Mizan URL such as:

```text
https://mizan.hijra.id/qr/<unguessable-token>
```

The token maps internally to a signature ledger row: signer, role, timestamp, document version, and status.

Caveats:

- The QR image renderer is an external fetchable URL because Google Docs cannot insert a base64 image directly. That external service should only see an opaque no-PII URL.
- QR signing is traceable internal attestation, not automatically a legally qualified e-signature or e-meterai.
- Token uniqueness should be per `(signer × document version)` and never reused.
- Signature dates should be business-defined. In Mizan, official MUAP/RSK signing dates fill only after the whole approval ladder is complete, using the last completing signature date — not Doc creation time and not “now.”

## Versioning, rollback, and freeze

### Built in Mizan

Mizan does **not** rely on Google Docs revision history for audit-grade versioning. It uses Drive `files.copy` snapshots and stores a `DocumentVersion` ledger.

Why:

- Google Docs revisions are not durable enough for audit retention.
- API restore/revert for native Docs is not a reliable app-controlled rollback mechanism.
- Named versions are UI-only.

Recommended model:

1. Keep one current editable Doc pointer.
2. At milestones, copy the current Doc to an immutable snapshot record.
3. To rollback, snapshot the current Doc first, then copy the chosen snapshot as the new current Doc. Never destroy history.
4. At final decision, export the current Docs to PDF, store the PDFs in object storage, and persist a content hash.

Mizan's committee freeze stores both MUAP and RSK PDFs plus a combined SHA-256. The PDF, not the live Google Doc, is the audit artifact.

## Read-back: when and how to read the edited Doc

### Built in Mizan

Mizan has had two read-back approaches:

1. **NamedRange/sentinel structured extraction** — precise for known cells, now dormant pending deletion.
2. **Markdown→AI extraction** — current active path. The app exports Google Docs to Markdown, masks PII, asks the inference provider for a Zod-validated `ExtractedSnapshot`, persists the run, and uses it for advisory score preview and AI context.

Important caveat: Mizan does **not** write read-back content into authoritative workflow fields. The read-back is advisory.

### Transferable decision table

| Need | Better approach |
|---|---|
| Read a few exact table cells that you anchored yourself | NamedRange extraction |
| Read broad human-authored prose or changing tables | Markdown export + parser/AI |
| Produce an audit artifact | PDF export + hash |
| Keep database fields synchronized with Docs | Avoid unless you have conflict resolution, ownership rules, and audit logs |

If you use Markdown→AI read-back:

- Treat it as an AI egress surface.
- Mask PII before egress.
- Use structured output validation.
- Reject malformed output instead of poisoning downstream scoring.
- Persist both success and failure reports.
- Keep prior OK snapshots or deterministic fallbacks.

## Verification checklist

Before declaring a Google Docs templating system “done,” prove each layer.

### Registry and unit tests

- [ ] Placeholder names are unique.
- [ ] Placeholder texts are unique and bracketed.
- [ ] NamedRange names are unique per occurrence.
- [ ] Forbidden/gating token names are rejected.
- [ ] Residual `{{token}}` scanner catches leaks.
- [ ] Hidden sentinels, if any, are excluded from leak scans intentionally.
- [ ] Deterministic resolvers format locale-specific values correctly, especially dates and currency.

### Master audit

- [ ] `documents.get` JSON walk inventories all `[bracket]` placeholders.
- [ ] JSON walk inventories underscore blanks and hard slots.
- [ ] Existing NamedRanges are listed.
- [ ] Coverage matrix says which slots are app-filled, human-filled, or out of scope.
- [ ] Registry and master match both ways: no dead registry vars, no forgotten app-known master slots.

### Live copy-and-fill smoke

- [ ] Copy master with Drive `files.copy`.
- [ ] Fill deterministic facts.
- [ ] Fill AI narratives with a safe stub or controlled provider.
- [ ] Fill targeted NamedRanges.
- [ ] Export to PDF or Markdown and inspect output.
- [ ] Assert no raw `{{token}}` leaks.
- [ ] Assert all mandatory known values landed.
- [ ] Assert unknown values remain useful human prompts, not blanks.
- [ ] Assert signature QR insertion works or fails visibly.

### Access and lifecycle

- [ ] A real user can preview the Doc without a request-access wall.
- [ ] The maker can edit only during the intended window.
- [ ] Frozen Docs downgrade/revoke write access or otherwise become audit-safe.
- [ ] Rollback snapshots current first; no version is destroyed.
- [ ] Decision freeze exports PDF and persists hash.

## Known Mizan caveats and doc drift

These are important when using Mizan as a reference:

1. **V3 + V3.5 is the current implementation.** Some older docs/comments still say “NamedRanges are only for QR/extraction.” That was true for V3 but is superseded by V3.5 for seven targeted MUAP value-fill slots.
2. **Markdown→AI read-back is active.** Some older docs say Markdown export is built but unwired and NamedRange extraction is live. Current state says Markdown→AI is active and NamedRange extraction is dormant.
3. **MUAP AI narrative slots are active; RSK narrative slots are not stamped the same way.** ADR-0017 superseded the earlier “AI narratives are no-ops in Docs” posture for MUAP only.
4. **Mizan is early-dev.** ADR status can lag the code in either direction (the access/lifecycle redesign — ADRs 0018/0019/0020 — shipped and merged 2026.06.12, superseding ADRs 0014/0016 §1). Check [`../CURRENT-STATE.md`](../CURRENT-STATE.md) before trusting an ADR as shipped behavior.
5. **PII posture is deliberately relaxed in some dev paths.** The masking seam exists, but residual PII backstop defaults can be fail-open in Mizan's demo posture. A production project should decide this explicitly.

## Copyable build plan for another project

Use this order:

1. **Inventory real templates.** Export/inspect via Docs API JSON, not only screenshots.
2. **Classify every blank.** `app-known`, `human-authored`, `signature`, `read-back anchor`, `out of scope`.
3. **Design the registry.** Include kind, source, fill method, template membership, and forbidden-token tests.
4. **Author placeholders.** Prefer unique human `[bracket]` labels for app-known values.
5. **Create targeted NamedRanges.** Only for hard anchors; one range per occurrence; backup-first.
6. **Build the copy/fill service.** Server-side credentials, retries, `replaceAllText`, targeted NamedRange fill, residual-token scan.
7. **Build access grants.** Make preview/edit work for real users without public link sharing.
8. **Build signing/freeze.** QR/signature anchors if needed; PDF export + content hash at the final decision point.
9. **Add read-back only if needed.** Keep it advisory unless you intentionally design authoritative Doc→DB sync.
10. **Smoke on live Google Docs.** Stubs are necessary for CI, but they do not prove Google Docs index/range behavior.

## Sources in Mizan

Current / canonical:

- [`../CURRENT-STATE.md`](../CURRENT-STATE.md)
- [`../designs/document-system.md`](../designs/document-system.md)
- [`../designs/doc-fill-v3.5-namedrange.md`](../designs/doc-fill-v3.5-namedrange.md)
- [`../references/document-templates.md`](../references/document-templates.md)
- [`../decisions/0013-docs-generation-v3-replace-all-text.md`](../decisions/0013-docs-generation-v3-replace-all-text.md)
- [`../decisions/0017-muap-ai-narrative-draft-slots.md`](../decisions/0017-muap-ai-narrative-draft-slots.md)
- [`../guides/google-docs-oauth.md`](google-docs-oauth.md)

Implementation:

- [`../../apps/web-app/src/lib/templates/doc-registry.ts`](../../apps/web-app/src/lib/templates/doc-registry.ts)
- [`../../apps/web-app/src/lib/templates/doc-registry.test.ts`](../../apps/web-app/src/lib/templates/doc-registry.test.ts)
- [`../../apps/web-app/src/server/docs/seed.ts`](../../apps/web-app/src/server/docs/seed.ts)
- [`../../apps/web-app/src/server/docs/seed.test.ts`](../../apps/web-app/src/server/docs/seed.test.ts)
- [`../../apps/web-app/src/server/docs/service.ts`](../../apps/web-app/src/server/docs/service.ts)
- [`../../apps/web-app/src/server/docs/qr-stamp.ts`](../../apps/web-app/src/server/docs/qr-stamp.ts)
- [`../../apps/web-app/src/server/google/auth.ts`](../../apps/web-app/src/server/google/auth.ts)
- [`../../apps/web-app/src/server/google/clients.ts`](../../apps/web-app/src/server/google/clients.ts)
- [`../../apps/web-app/src/server/ai/extract-from-markdown.ts`](../../apps/web-app/src/server/ai/extract-from-markdown.ts)
- [`../../apps/web-app/src/server/ai/narrative.ts`](../../apps/web-app/src/server/ai/narrative.ts)

Authoring scripts:

- [`../../apps/web-app/scripts/audit-master-coverage.ts`](../../apps/web-app/scripts/audit-master-coverage.ts)
- [`../../apps/web-app/scripts/author-v3-raw-masters.ts`](../../apps/web-app/scripts/author-v3-raw-masters.ts)
- [`../../apps/web-app/scripts/setup-v35-namedranges.ts`](../../apps/web-app/scripts/setup-v35-namedranges.ts)
- [`../../apps/web-app/scripts/place-narrative-slots.ts`](../../apps/web-app/scripts/place-narrative-slots.ts)
- [`../../apps/web-app/scripts/author-momsp3-masters.ts`](../../apps/web-app/scripts/author-momsp3-masters.ts)
