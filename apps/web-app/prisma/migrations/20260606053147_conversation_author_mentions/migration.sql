-- AlterTable
ALTER TABLE "ConversationMessage" ADD COLUMN     "authorId" TEXT,
ADD COLUMN     "authorName" TEXT,
ADD COLUMN     "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[];
