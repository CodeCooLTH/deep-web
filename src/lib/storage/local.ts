import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { validateUpload, fileIdExt, type Storage } from "./types";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

export const saveFile: Storage["saveFile"] = async (file, opts) => {
  if (!opts?.skipValidation) validateUpload(file);
  if (!existsSync(UPLOAD_DIR)) await mkdir(UPLOAD_DIR, { recursive: true });

  const ext = file.name.split(".").pop() || "bin";
  const fileId = `${uuid()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, fileId), buffer);

  return fileId;
};

export const getFile: Storage["getFile"] = async (fileId) => {
  const filePath = path.join(UPLOAD_DIR, fileId);
  if (!filePath.startsWith(UPLOAD_DIR)) return null;
  if (!existsSync(filePath)) return null;

  const buffer = await readFile(filePath);
  return { buffer, ext: fileIdExt(fileId) };
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
