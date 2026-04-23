ALTER TABLE "EventEnrollment" ADD COLUMN "enrollmentType" TEXT NOT NULL DEFAULT 'PRIMARY';

DROP INDEX IF EXISTS "EventEnrollment_eventId_userId_key";
DROP INDEX IF EXISTS "EventEnrollment_optionId_idx";

CREATE UNIQUE INDEX "EventEnrollment_optionId_userId_key" ON "EventEnrollment"("optionId", "userId");
CREATE INDEX "EventEnrollment_eventId_optionId_enrollmentType_idx" ON "EventEnrollment"("eventId", "optionId", "enrollmentType");
CREATE INDEX "EventEnrollment_eventId_userId_idx" ON "EventEnrollment"("eventId", "userId");

CREATE TABLE "EventAccessUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "EventAccessUser_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EventAccessUser_eventId_userId_key" ON "EventAccessUser"("eventId", "userId");
CREATE INDEX "EventAccessUser_eventId_position_idx" ON "EventAccessUser"("eventId", "position");
