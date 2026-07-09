import assert from "node:assert/strict";
import { canChangeProcess, enterpriseScope, entrepreneurScope, processScope } from "../src/security/access-control.js";
import type { AuthUser } from "../src/middleware/auth.js";

const admin: AuthUser = { id: "admin-1", name: "Admin", email: "admin@example.test", role: "ADMIN" };
const analyst: AuthUser = { id: "analyst-1", name: "Analyst", email: "analyst@example.test", role: "ANALISTA" };
const entrepreneur: AuthUser = { id: "user-1", name: "Owner", email: "owner@example.test", role: "EMPREENDEDOR" };

assert.deepEqual(processScope(admin), {});
assert.deepEqual(processScope(entrepreneur), { entrepreneur: { userId: entrepreneur.id } });
assert.deepEqual(entrepreneurScope(entrepreneur), { userId: entrepreneur.id });
assert.deepEqual(enterpriseScope(entrepreneur), { entrepreneur: { userId: entrepreneur.id } });

assert.equal(canChangeProcess(admin, { analystId: null }), true);
assert.equal(canChangeProcess(analyst, { analystId: analyst.id }), true);
assert.equal(canChangeProcess(analyst, { analystId: "other-analyst" }), false);
assert.equal(canChangeProcess(entrepreneur, { analystId: analyst.id }), false);

console.log("security-policy.test.ts passou");
