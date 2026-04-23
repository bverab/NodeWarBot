ALTER TABLE "Event" ADD COLUMN "accessMode" TEXT NOT NULL DEFAULT 'OPEN';

CREATE TABLE "EventAccessRole" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "EventAccessRole_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "EventFillerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isFake" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventFillerEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EventAccessRole_eventId_roleId_key" ON "EventAccessRole"("eventId", "roleId");
CREATE INDEX "EventAccessRole_eventId_position_idx" ON "EventAccessRole"("eventId", "position");
CREATE UNIQUE INDEX "EventFillerEntry_eventId_userId_key" ON "EventFillerEntry"("eventId", "userId");
CREATE INDEX "EventFillerEntry_eventId_joinedAt_idx" ON "EventFillerEntry"("eventId", "joinedAt");
