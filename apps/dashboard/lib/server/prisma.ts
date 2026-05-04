import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  __spectreDashboardPrisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.__spectreDashboardPrisma ??
  new PrismaClient({
    log: ["warn", "error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__spectreDashboardPrisma = prisma;
}
