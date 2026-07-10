import type { LicenseType, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function findLicenseRule(licenseType: LicenseType, client: DbClient = prisma) {
  return client.licenseRule.findFirst({
    where: { licenseType, isActive: true }
  });
}

export function addDaysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

export async function nextProcessNumber(year: number, client: Prisma.TransactionClient) {
  const sequence = await client.processSequence.upsert({
    where: { year },
    create: { year, nextNumber: 2 },
    update: { nextNumber: { increment: 1 } }
  });
  const number = sequence.nextNumber - 1;
  return `${year}.${String(number).padStart(6, "0")}`;
}

export function requiredDocumentsFor(activityDocuments: string[], ruleDocuments: string[]) {
  return Array.from(new Set([...activityDocuments, ...ruleDocuments].map((item) => item.trim()).filter(Boolean)));
}
