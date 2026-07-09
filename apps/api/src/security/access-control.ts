import type { Prisma } from "@prisma/client";
import type { AuthUser } from "../middleware/auth.js";

const internalRoles: AuthUser["role"][] = ["ADMIN", "ANALISTA", "FISCAL"];

export function isInternal(user: AuthUser) {
  return internalRoles.includes(user.role);
}

export function isAdmin(user: AuthUser) {
  return user.role === "ADMIN";
}

export function isAnalystOrAdmin(user: AuthUser) {
  return user.role === "ADMIN" || user.role === "ANALISTA";
}

export function processScope(user: AuthUser): Prisma.ProcessWhereInput {
  if (user.role === "ADMIN") return {};
  if (user.role === "ANALISTA") return { OR: [{ analystId: user.id }, { analystId: null }] };
  if (user.role === "FISCAL") return { inspections: { some: { fiscalId: user.id } } };
  return { entrepreneur: { userId: user.id } };
}

export function entrepreneurScope(user: AuthUser): Prisma.EntrepreneurWhereInput {
  if (isInternal(user)) return {};
  return { userId: user.id };
}

export function enterpriseScope(user: AuthUser): Prisma.EnterpriseWhereInput {
  if (isInternal(user)) return {};
  return { entrepreneur: { userId: user.id } };
}

export function inspectionScope(user: AuthUser): Prisma.InspectionWhereInput {
  if (user.role === "ADMIN" || user.role === "ANALISTA") return {};
  if (user.role === "FISCAL") return { fiscalId: user.id };
  return { process: { entrepreneur: { userId: user.id } } };
}

export function canChangeProcess(user: AuthUser, process: { analystId: string | null }) {
  return user.role === "ADMIN" || (user.role === "ANALISTA" && process.analystId === user.id);
}
