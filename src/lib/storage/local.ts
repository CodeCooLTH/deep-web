import { writeFile, mkdir, readFile, unlink, stat, open } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { validateUpload, fileIdExt, type Storage } from "./types";
import { uploadDatePrefix } from "@/lib/format-date";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

export const saveFile: Storage["saveFile"] = async (file, opts) => {
  if (!opts?.skipValidation) validateUpload(file);

  const ext = file.name.split(".").pop() || "bin";
  // ชาร์ดเป็น YYYY/MM/DD/ (user 2026-07-25) — fileId = path relative (มี slash); mkdir โฟลเดอร์วันนั้นก่อน
  const fileId = `${uploadDatePrefix(new Date())}/${uuid()}.${ext}`;
  const filePath = path.join(UPLOAD_DIR, fileId);
  await mkdir(path.dirname(filePath), { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  return fileId;
};

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
