-- CreateTable
CREATE TABLE "TemplateReferenceText" (
    "templateId" TEXT NOT NULL,
    "tokenName" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceDocRevisionId" TEXT,

    CONSTRAINT "TemplateReferenceText_pkey" PRIMARY KEY ("templateId","tokenName")
);

-- CreateIndex
CREATE INDEX "TemplateReferenceText_templateId_idx" ON "TemplateReferenceText"("templateId");
