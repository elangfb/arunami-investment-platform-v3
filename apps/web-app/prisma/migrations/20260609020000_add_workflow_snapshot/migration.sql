-- AlterTable: persist the WorkflowSnapshot read-model (ADR-0004 §3 Phase 3a). Nullable: existing
-- rows backfill on their next save (server/repo/write.ts re-derives) or via re-seed; reads fall
-- back to deriveWorkflowSnapshot when null. `stage` remains the authoritative cursor (Phase 3a).
ALTER TABLE "Application" ADD COLUMN "workflowSnapshot" JSONB;
