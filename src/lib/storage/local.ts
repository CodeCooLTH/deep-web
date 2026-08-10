import { writeFile, mkdir, readFile, unlink, stat, open } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { validateUpload, fileIdExt, newFileId, type Storage } from "./types";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

export const saveFile: Storage["saveFile"] = async (file, opts) => {
  if (!opts?.skipValidation) validateUpload(file);

  const fileId = newFileId(file.name.split(".").pop() || "bin");
  const filePath = path.join(UPLOAD_DIR, fileId);
  await mkdir(path.dirname(filePath), { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  return fileId;
};

/**
 * dev ไม่มี presigned URL ให้ยิง — ให้ client PUT เข้า route ของเราเองที่ `/api/uploads/local/…`
 *
 * ทำแบบนี้แทนการ "ให้ dev ตกไปใช้ multipart เดิม" โดยตั้งใจ: เส้นทางที่ prod เดินต้องเป็น
 * เส้นทางที่ dev เดินด้วย ไม่งั้น flow นี้จะไม่เคยถูกทดสอบเลยจนกว่าจะขึ้น prod
 * (บทเรียนซ้ำของโปรเจกต์นี้ — iframe builder ที่ตายสนิทบน prod ตั้งแต่ deploy แรก)
 *
 * ไม่มีเพดานขนาดที่ชั้นนี้เพราะ dev server ไม่มีเพดาน 4.5MB ของ Vercel — ตัวบังคับจริงคือ
 * `maxSize` ใน claim ที่ route ตรวจตอนรับ และ commit ที่ตรวจขนาดจริงอีกชั้น
 */
export const createUploadTicket: Storage["createUploadTicket"] = async ({ ext, contentType }) => {
  const fileId = newFileId(ext);
  return {
    fileId,
    url: `/api/uploads/local/${fileId}`,
    method: "PUT",
    headers: { "content-type": contentType },
    requiresTicketToken: true,
  };
};

/** เขียนไฟล์ลง key ที่ถูกจ่ายไปแล้ว — ใช้โดย `PUT /api/uploads/local/[...]` เท่านั้น (dev) */
export async function writeLocalFile(fileId: string, buffer: Buffer): Promise<boolean> {
  const filePath = resolveInsideUploadDir(fileId);
  if (!filePath) return false;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, buffer);
  return true;
}

export const getFile: Storage["getFile"] = async (fileId) => {
  const filePath = path.join(UPLOAD_DIR, fileId);
  if (!filePath.startsWith(UPLOAD_DIR)) return null;
  if (!existsSync(filePath)) return null;

  const buffer = await readFile(filePath);
  return { buffer, ext: fileIdExt(fileId) };
};

/** path-traversal guard เดียวกับ getFile — fileId มาจาก URL segment ผู้ใช้ */
function resolveInsideUploadDir(fileId: string): string | null {
  const filePath = path.join(UPLOAD_DIR, fileId);
  return filePath.startsWith(UPLOAD_DIR) ? filePath : null;
}

export const getFileMeta: Storage["getFileMeta"] = async (fileId) => {
  const filePath = resolveInsideUploadDir(fileId);
  if (!filePath) return null;

  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) return null;
    return { size: stats.size, ext: fileIdExt(fileId) };
  } catch {
    return null;
  }
};

export const getFileRange: Storage["getFileRange"] = async (fileId, range) => {
  const filePath = resolveInsideUploadDir(fileId);
  if (!filePath) return null;
  if (!existsSync(filePath)) return null;

  const length = range.end - range.start + 1;
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, range.start);
    // ไฟล์อาจสั้นลงระหว่าง stat กับ read — ส่งเท่าที่อ่านได้จริง
    return {
      buffer: bytesRead === length ? buffer : buffer.subarray(0, bytesRead),
      ext: fileIdExt(fileId),
    };
  } finally {
    await handle.close();
  }
};

export const getFileUrl: Storage["getFileUrl"] = async (fileId) => {
  return `/api/files/${fileId}`;
};

export const deleteFile: Storage["deleteFile"] = async (fileId) => {
  const filePath = path.join(UPLOAD_DIR, fileId);
  if (!filePath.startsWith(UPLOAD_DIR)) return;
  if (!existsSync(filePath)) return;
  await unlink(filePath);
};
