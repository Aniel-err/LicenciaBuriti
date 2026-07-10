import assert from "node:assert/strict";
import { canChangeProcess, enterpriseScope, entrepreneurScope, inspectionScope, processScope } from "../src/security/access-control.js";
import { canRole, permissions } from "../src/security/permissions.js";
import { requiredDocumentsFor } from "../src/licensing/rules.js";
import type { AuthUser } from "../src/middleware/auth.js";

const admin: AuthUser = { id: "admin-1", name: "Admin", email: "admin@example.test", role: "ADMIN" };
const analyst: AuthUser = { id: "analyst-1", name: "Analyst", email: "analyst@example.test", role: "ANALISTA" };
const fiscal: AuthUser = { id: "fiscal-1", name: "Fiscal", email: "fiscal@example.test", role: "FISCAL" };
const entrepreneur: AuthUser = { id: "user-1", name: "Owner", email: "owner@example.test", role: "EMPREENDEDOR" };

assert.deepEqual(processScope(admin), {});
assert.deepEqual(processScope(entrepreneur), { entrepreneur: { userId: entrepreneur.id } });
assert.deepEqual(entrepreneurScope(entrepreneur), { userId: entrepreneur.id });
assert.deepEqual(enterpriseScope(entrepreneur), { entrepreneur: { userId: entrepreneur.id } });
assert.deepEqual(inspectionScope(fiscal), { fiscalId: fiscal.id });
assert.deepEqual(inspectionScope(entrepreneur), { process: { entrepreneur: { userId: entrepreneur.id } } });

assert.equal(canChangeProcess(admin, { analystId: null }), true);
assert.equal(canChangeProcess(analyst, { analystId: analyst.id }), true);
assert.equal(canChangeProcess(analyst, { analystId: "other-analyst" }), false);
assert.equal(canChangeProcess(entrepreneur, { analystId: analyst.id }), false);

assert.equal(canRole("ADMIN", "users.manage"), true);
assert.equal(canRole("ANALISTA", "users.manage"), false);
assert.equal(canRole("FISCAL", "inspection.validate"), true);
assert.equal(canRole("EMPREENDEDOR", "document.validate"), false);
assert.deepEqual(permissions["license.issue"], ["ADMIN", "ANALISTA"]);
assert.deepEqual(requiredDocumentsFor(["Requerimento", "ART"], ["ART", "CAR"]), ["Requerimento", "ART", "CAR"]);

console.log("security-policy.test.ts passou");
