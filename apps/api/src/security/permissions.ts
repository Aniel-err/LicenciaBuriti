import type { AuthUser } from "../middleware/auth.js";

export const permissions = {
  "users.manage": ["ADMIN"],
  "audit.read": ["ADMIN"],
  "settings.update": ["ADMIN"],
  "catalog.manage": ["ADMIN"],
  "templates.read": ["ADMIN", "ANALISTA"],
  "templates.create": ["ADMIN", "ANALISTA"],
  "templates.delete": ["ADMIN"],
  "process.read": ["ADMIN", "ANALISTA", "FISCAL", "EMPREENDEDOR"],
  "process.create": ["ADMIN", "ANALISTA", "EMPREENDEDOR"],
  "process.assign": ["ADMIN", "ANALISTA"],
  "process.changeStatus": ["ADMIN", "ANALISTA"],
  "process.message": ["ADMIN", "ANALISTA", "FISCAL", "EMPREENDEDOR"],
  "process.requestDocument": ["ADMIN", "ANALISTA"],
  "process.opinion": ["ADMIN", "ANALISTA"],
  "document.upload": ["ADMIN", "ANALISTA", "EMPREENDEDOR"],
  "document.validate": ["ADMIN", "ANALISTA"],
  "document.download": ["ADMIN", "ANALISTA", "FISCAL", "EMPREENDEDOR"],
  "inspection.create": ["ADMIN", "ANALISTA", "FISCAL"],
  "inspection.validate": ["ADMIN", "ANALISTA", "FISCAL"],
  "license.issue": ["ADMIN", "ANALISTA"],
  "reports.read": ["ADMIN", "ANALISTA", "FISCAL", "EMPREENDEDOR"]
} as const satisfies Record<string, readonly AuthUser["role"][]>;

export type PermissionAction = keyof typeof permissions;

export function canRole(role: AuthUser["role"], action: PermissionAction) {
  return (permissions[action] as readonly AuthUser["role"][]).includes(role);
}
