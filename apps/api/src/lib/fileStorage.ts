import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { extensionForMime, type SupportedImageMime } from "./imageFiles.js";

const PREFIX = "local:";

function storageRoot() {
  return path.resolve(env.FILE_STORAGE_ROOT);
}

function safeRelativePath(value: string) {
  const normalized = value.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.includes("..") || normalized.includes("\0")) {
    throw new Error("Unsafe storage path.");
  }
  return normalized;
}

function localPathFromLocator(locator: string) {
  if (!locator.startsWith(PREFIX)) throw new Error("Unsupported storage locator.");
  const relative = safeRelativePath(locator.slice(PREFIX.length));
  const root = storageRoot();
  const absolute = path.resolve(root, relative);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) throw new Error("Unsafe storage path.");
  return absolute;
}

export async function saveDriverPhoto(input: { organizationId: string; driverId: string; buffer: Buffer; mime: SupportedImageMime }) {
  const ext = extensionForMime(input.mime);
  const relative = safeRelativePath(path.posix.join("driver-photos", input.organizationId, input.driverId, `${randomUUID()}.${ext}`));
  const absolute = path.resolve(storageRoot(), relative);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, input.buffer, { flag: "wx", mode: 0o600 });
  return `${PREFIX}${relative}`;
}

export async function readPrivateFile(locator: string) {
  return readFile(localPathFromLocator(locator));
}

export async function deletePrivateFile(locator: string | null | undefined) {
  if (!locator?.startsWith(PREFIX)) return;
  await rm(localPathFromLocator(locator), { force: true });
}
