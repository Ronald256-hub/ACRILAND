import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { extensionForMime, type SupportedImageMime } from "./imageFiles.js";

const PREFIX = "local:";

function storageRoot() { return path.resolve(env.FILE_STORAGE_ROOT); }
function safeRelativePath(value: string) {
  const normalized = value.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.includes("..") || normalized.includes("\0")) throw new Error("Unsafe storage path.");
  return normalized;
}
function localPathFromLocator(locator: string) {
  if (!locator.startsWith(PREFIX)) throw new Error("Unsupported storage locator.");
  const relative = safeRelativePath(locator.slice(PREFIX.length));
  const root = storageRoot(); const absolute = path.resolve(root, relative);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) throw new Error("Unsafe storage path.");
  return absolute;
}
async function savePrivate(input:{relativeDirectory:string;extension:string;buffer:Buffer}){
  const relative=safeRelativePath(path.posix.join(input.relativeDirectory,`${randomUUID()}.${input.extension}`));
  const absolute=path.resolve(storageRoot(),relative);await mkdir(path.dirname(absolute),{recursive:true});await writeFile(absolute,input.buffer,{flag:"wx",mode:0o600});return `${PREFIX}${relative}`;
}

export async function saveDriverPhoto(input: { organizationId: string; driverId: string; buffer: Buffer; mime: SupportedImageMime }) {
  return savePrivate({relativeDirectory:path.posix.join("driver-photos",input.organizationId,input.driverId),extension:extensionForMime(input.mime),buffer:input.buffer});
}

export type PrivateEvidenceMime=SupportedImageMime|"application/pdf";
export function detectPrivateEvidenceMime(buffer:Buffer):PrivateEvidenceMime|null{
  if(buffer.length>=5&&buffer.subarray(0,5).toString("ascii")==="%PDF-")return "application/pdf";
  if(buffer.length>=3&&buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff)return "image/jpeg";
  if(buffer.length>=8&&buffer[0]===0x89&&buffer[1]===0x50&&buffer[2]===0x4e&&buffer[3]===0x47&&buffer[4]===0x0d&&buffer[5]===0x0a&&buffer[6]===0x1a&&buffer[7]===0x0a)return "image/png";
  if(buffer.length>=12&&buffer.subarray(0,4).toString("ascii")==="RIFF"&&buffer.subarray(8,12).toString("ascii")==="WEBP")return "image/webp";
  return null;
}
export async function saveHandoverEvidence(input:{organizationId:string;handoverId:string;buffer:Buffer;mime:SupportedImageMime}){
  return savePrivate({relativeDirectory:path.posix.join("handover-evidence",input.organizationId,input.handoverId),extension:extensionForMime(input.mime),buffer:input.buffer});
}
export async function saveVaultDocument(input:{organizationId:string;entityType:string;entityId:string;buffer:Buffer;mime:PrivateEvidenceMime}){
  const extension=input.mime==="application/pdf"?"pdf":extensionForMime(input.mime);
  return savePrivate({relativeDirectory:path.posix.join("document-vault",input.organizationId,input.entityType.toLowerCase(),input.entityId),extension,buffer:input.buffer});
}
export async function readPrivateFile(locator: string) { return readFile(localPathFromLocator(locator)); }
export async function deletePrivateFile(locator: string | null | undefined) { if (!locator?.startsWith(PREFIX)) return; await rm(localPathFromLocator(locator), { force: true }); }
