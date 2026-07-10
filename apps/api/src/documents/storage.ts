import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const documentsRoot = path.resolve("uploads", "documents");

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function saveDocumentFile(processId: string, documentId: string, version: number, originalName: string, buffer: Buffer) {
  const safeName = safeFileName(originalName);
  const storageKey = path.join(processId, documentId, `${String(version).padStart(3, "0")}-${safeName}`);
  const absoluteDir = path.join(documentsRoot, processId, documentId);
  const absolutePath = path.join(documentsRoot, storageKey);
  await mkdir(absoluteDir, { recursive: true });
  await writeFile(absolutePath, buffer);

  return {
    fileName: safeName,
    filePath: absolutePath,
    storageKey,
    fileSha256: createHash("sha256").update(buffer).digest("hex"),
    fileSizeBytes: buffer.length
  };
}

export function resolveDocumentFile(filePath: string | null | undefined) {
  if (!filePath) return null;
  const resolved = path.resolve(filePath);
  const relative = path.relative(documentsRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return resolved;
}

export function assertPdfLooksSafe(buffer: Buffer) {
  const text = buffer.subarray(0, Math.min(buffer.length, 1024 * 1024)).toString("latin1");
  const activePatterns = [/\/JavaScript\b/i, /\/JS\b/i, /\/Launch\b/i, /\/OpenAction\b/i, /\/AA\b/i, /\/EmbeddedFile\b/i];
  if (activePatterns.some((pattern) => pattern.test(text))) {
    throw Object.assign(new Error("PDF contem recurso ativo nao permitido"), { status: 400 });
  }
}
