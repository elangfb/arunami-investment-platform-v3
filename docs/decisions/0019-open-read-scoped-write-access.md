# ADR-0019: Open-read, scoped-write access; broad folder-share + Mizan-owned generated docs — relaxes ADR-0014

- **Status:** accepted — ratified 2026.06.11. **Implemented 2026.06.11** (build P4-C + the §3-addendum below): open read (universal `canViewDoc`), Mizan-owned generated docs + user-folder shortcut (§4), and the folder-share (§3) at **per-email granularity on a single root folder** (see the addendum — the group/domain mechanism proper stays W1).
- **Date:** 2026.06.11
- **Relaxes / supersedes [ADR-0014](0014-doc-access-jit-per-user-grants.md)'s access model:** the per-email
  just-in-time Drive grant (`type=user`, one email at a time, driven by `driveRoleForDoc`) is **replaced by a
  broad folder-share** under open-read access; generated docs move from per-app `files.copy` into a **Mizan-owned
  Drive skeleton + a shortcut** into the user folder. ADR-0014's *audit intent* (a recorded, idempotent grant
  ledger) and ADR-0016's freeze-on-advance survive; only the per-email grant *mechanism* is relaxed (the PII
  parking is a separate forward constraint — Fork B4, §5 below, not anything in ADR-0014). Settles design Topic 6 + Forks A3/B4/B5.

## Context

The [RM-led pipeline redesign](../designs/rm-led-pipeline-redesign.md) reshapes Mizan around a
**Customer → Deal → Document** graph with Google Drive as the document substrate. Its "Mizan is not a
bottleneck" intent applies directly to *seeing*: an RM, TL, risk officer, or committee member must be able to
open any customer file, deal, or AI output without a per-email grant dance. ADR-0014's JIT model — one
`type=user` Drive permission per human per doc, gated by `driveRoleForDoc` — was built for the opposite world
(everything private to the Mizan account; access widened one email at a time). Under open read it is friction,
not protection.

The forces:

- **Open read is the product intent**, but **write must stay scoped** — the maker-checker engine's integrity
  depends on it. Read-everything and write-anything are different axes (Fork A3).
- **Generated docs** (MUAP/RSK/MoM/SP3) are authoritative artifacts. They must live somewhere Mizan owns and
  freezes, not in a user-controlled folder where they can be moved, edited, or deleted out from under the audit
  trail (Topic 6 / Fork B5).
- **PII is parked, not gone** (Fork B4). Early-dev posture (2026.06.11) builds the happy path; the masking seam
  stays in code as a config-flag no-op and re-enables at OJK W1. Relaxing access now is a *reversible* call made
  with that constraint recorded, not waived.

## Decision

1. **READ is fully open.** Any Mizan account sees every customer, deal, document, and AI output. Drive
   visibility follows: the broad folder-share grants read across the relevant skeleton, replacing ADR-0014's
   per-email reader grants.

2. **WRITE stays desk/role-scoped for authoritative-state changes** — stage transitions, approvals/signing,
   the Komite decision & scheduling, doc generation, config, **and data that feeds gates** (financials,
   OCR-confirm, Kol). **Annotations are open + attributed** — custom-context notes, the discussion thread, file
   tags, personal status. The rule: *changes authoritative state → scoped; pure annotation → open* (Fork A3).

3. **Broad folder-share SUPERSEDES the per-email JIT grant model.** Drive access is granted at the
   folder/skeleton level rather than one `type=user` permission per human per doc. ADR-0014's audit intent (a
   recorded, idempotent grant ledger; a handle for a future revoke) is preserved at the new granularity.

   > **§3 addendum — V1 mechanism, shipped 2026.06.11 (`apps/web-app/src/server/docs/root-share.ts`).**
   > The group/domain share this section ultimately wants needs a Google Workspace organization the single
   > Mizan Gmail account does not have (W1 item). The shipped V1 stand-in achieves the same folder-level
   > grant **at per-email granularity**: one root **"Mizan"** folder (per-app generated-doc folders are
   > parented under it; Drive permissions inherit downward), and one `type=user` `reader` permission on that
   > root per user — N member grants instead of N×M per-doc grants, ledgered in `DriveRootGrant`. Two
   > refinements decided during the build (adversarial review 2026.06.11):
   > - **Boundary: ADMITTED users only** (superadmin or ≥1 effective desk — the same wall as the in-app
   >   awaiting-access screen). §1's "any Mizan account" operationally means an *admitted* account: a
   >   zero-desk stranger who merely signed in must not gain Drive read over the customer-PII doc tree.
   > - **Revocation is part of the contract:** offboarding (admin revoke actions, login backstop, and the
   >   reconcile sweep's revoke-down pass) deletes the root permission — open read is scoped to current
   >   staff, not alumni.
   > At W1 the swap is mechanical: replace the N member grants with 1 group/domain grant on the same root.
   > Forcing function: Drive's ~600 direct-permission ceiling per item (alarmed at 500). The per-email
   > per-doc JIT grants (ADR-0014 mechanism) remain for **writer** grants (makers) and as redundant reader
   > belt-and-braces.

4. **Generated docs live Mizan-owned in Mizan Drive, with a shortcut into the user folder.** MUAP/RSK/MoM/SP3
   are written into the Mizan-standard skeleton (`Mizan/Nasabah/…/Pengajuan/<deal>/Dokumen Mizan/`),
   Mizan-owned + frozen; a **shortcut** (by file ID) is dropped into the user's app folder so the user can
   reorganize freely without breaking the link. If Mizan lacks Editor to place the shortcut: **warn + "Coba
   lagi" retry** — the doc still lives in Mizan and is viewable in-app, nothing breaks. Generated-doc
   versioning stays Drive copy-snapshots (`DocumentVersion`, ADR-0008); source docs use the manifest ledger
   (Fork B5).

5. **PII/compliance is a parked forward constraint, not a removed one.** Context injection and egress route
   through the `maskForEgress` seam as a **config-flag no-op** (default off in dev; the machinery is kept, not
   deleted). OJK W1 ratification will almost certainly reinstate masking and tighten access scoping (Fork B4).

## Consequences

- Participants open any customer/deal/doc without a request-access wall or a per-email grant round-trip; the
  "Mizan is not a bottleneck" intent holds for reading.
- The maker-checker engine's authority is unchanged: only authoritative-state writes are scoped, so opening read
  wide does not weaken workflow integrity.
- Generated docs cannot be silently moved, edited, or deleted by users — they live Mizan-owned and frozen, with
  only a shortcut exposed. The trade-off: a missing Editor permission degrades to an in-app-only view + retry,
  never a broken doc.
- ADR-0014's per-email JIT grant path (`driveRoleForDoc`-per-human) is retired for new flows; the freeze
  invariants (ADR-0016) and copy-snapshot versioning (ADR-0008) still stand.
- Open read **defers** a real PII exposure surface to W1: while masking is parked, any Mizan account can see
  unmasked customer data. This is an accepted early-dev call, recorded here so W1 re-enablement is a known,
  scheduled reversal — not a rediscovery.
