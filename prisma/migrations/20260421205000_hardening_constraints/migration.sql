CREATE UNIQUE INDEX IF NOT EXISTS "Event_messageId_key" ON "Event"("messageId");
CREATE UNIQUE INDEX IF NOT EXISTS "EventRoleSlot_eventId_position_key" ON "EventRoleSlot"("eventId", "position");
CREATE UNIQUE INDEX IF NOT EXISTS "EventWaitlistEntry_eventId_position_key" ON "EventWaitlistEntry"("eventId", "position");
CREATE INDEX IF NOT EXISTS "Event_channelId_createdAt_idx" ON "Event"("channelId", "createdAt");

PRAGMA foreign_keys=OFF;

CREATE TABLE "new_EventParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "roleSlotId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isFake" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventParticipant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventParticipant_roleSlotId_fkey" FOREIGN KEY ("roleSlotId") REFERENCES "EventRoleSlot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_EventParticipant" ("id", "eventId", "roleSlotId", "userId", "displayName", "isFake", "joinedAt")
WITH ranked AS (
  SELECT
    p.id,
    r.eventId,
    p.roleSlotId,
    p.userId,
    p.displayName,
    p.isFake,
    p.joinedAt,
    ROW_NUMBER() OVER (
      PARTITION BY r.eventId, p.userId
      ORDER BY p.joinedAt ASC, p.rowid ASC
    ) AS rn
  FROM "EventParticipant" p
  JOIN "EventRoleSlot" r ON r.id = p.roleSlotId
)
SELECT id, eventId, roleSlotId, userId, displayName, isFake, joinedAt
FROM ranked
WHERE rn = 1;

DROP TABLE "EventParticipant";
ALTER TABLE "new_EventParticipant" RENAME TO "EventParticipant";

CREATE UNIQUE INDEX "EventParticipant_roleSlotId_userId_key" ON "EventParticipant"("roleSlotId", "userId");
CREATE UNIQUE INDEX "EventParticipant_eventId_userId_key" ON "EventParticipant"("eventId", "userId");
CREATE INDEX "EventParticipant_eventId_idx" ON "EventParticipant"("eventId");
CREATE INDEX "EventParticipant_userId_idx" ON "EventParticipant"("userId");

PRAGMA foreign_keys=ON;
