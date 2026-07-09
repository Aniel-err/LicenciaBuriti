import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const rootDist = resolve("dist");
const webDist = resolve("apps/web/dist");
const hostingConfig = resolve(".openai/hosting.json");

await rm(rootDist, { recursive: true, force: true });
await cp(webDist, rootDist, { recursive: true });
await cp(webDist, resolve(rootDist, "client"), { recursive: true });
await mkdir(resolve(rootDist, ".openai"), { recursive: true });
await cp(hostingConfig, resolve(rootDist, ".openai/hosting.json"));
await mkdir(resolve(rootDist, "server"), { recursive: true });
await writeFile(
  resolve(rootDist, "server/index.js"),
  `async function handle(request, env) {
  const url = new URL(request.url);
  const assets = env && env.ASSETS;

  if (assets && typeof assets.fetch === "function") {
    const assetResponse = await assets.fetch(request);
    if (assetResponse.status !== 404) return assetResponse;

    const fallbackUrl = new URL("/index.html", url);
    return assets.fetch(new Request(fallbackUrl, request));
  }

  return new Response("Site asset binding is unavailable.", { status: 500 });
}

export { handle as fetch };
export default Object.assign(handle, { fetch: handle });
`,
  "utf8"
);
