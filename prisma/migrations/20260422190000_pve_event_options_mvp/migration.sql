CREATE TABLE "EventOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    CONSTRAINT "EventOption_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "EventEnrollment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isFake" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventEnrollment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventEnrollment_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "EventOption" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EventOption_eventId_position_key" ON "EventOption"("eventId", "position");
CREATE INDEX "EventOption_eventId_time_idx" ON "EventOption"("eventId", "time");
CREATE UNIQUE INDEX "EventEnrollment_eventId_userId_key" ON "EventEnrollment"("eventId", "userId");
CREATE INDEX "EventEnrollment_eventId_joinedAt_idx" ON "EventEnrollment"("eventId", "joinedAt");
CREATE INDEX "EventEnrollment_optionId_idx" ON "EventEnrollment"("optionId");
