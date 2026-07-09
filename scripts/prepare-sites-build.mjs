import { cp, rm } from "node:fs/promises";
import { resolve } from "node:path";

const rootDist = resolve("dist");
const webDist = resolve("apps/web/dist");

await rm(rootDist, { recursive: true, force: true });
await cp(webDist, rootDist, { recursive: true });
