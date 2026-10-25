-- CreateTable
CREATE TABLE "EventPveCloseReview" (
    "eventId" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "threadId" TEXT,
    "voteMessageId" TEXT,
    "voteEndsAt" DATETIME,
    "status" TEXT,
    "extensionUsed" BOOLEAN NOT NULL DEFAULT false,
    "finalizedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EventPveCloseReview_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EventPveCloseReview_voteMessageId_idx" ON "EventPveCloseReview"("voteMessageId");
