import * as local from "./local";
import * as s3 from "./s3";

const driver = process.env.STORAGE_DRIVER ?? "local";
const impl = driver === "s3" ? s3 : local;

export const saveFile = impl.saveFile;
export const createUploadTicket = impl.createUploadTicket;
export const getFile = impl.getFile;
export const getFileMeta = impl.getFileMeta;
export const getFileRange = impl.getFileRange;
export const getFileUrl = impl.getFileUrl;
export const deleteFile = impl.deleteFile;

export * from "./types";
