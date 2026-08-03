export const MAX_SIZE = 5 * 1024 * 1024;
// รองรับไฟล์รูปภาพ + PDF (PRD FR-2.5: L3 business registration รับ PDF ได้)
// Client validation ใน VerificationClient.tsx ยอมรับ application/pdf สำหรับ L3
// อยู่แล้ว — นี่คือ server-side match เพื่อให้ upload ไม่ silently drop
export const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  // image/gif: รองรับเพื่อ mirror รูป/สติกเกอร์เคลื่อนไหวจาก Messenger/IG (feature 00018) —
  // เก็บ raw bytes ไม่ re-encode จึงคง animation ไว้. seller upload ฝั่ง chat ยัง gate ด้วย
  // CHAT_IMAGE_ALLOWED_EXT (route messages) แยกต่างหาก จึงไม่เปิดให้ seller ส่ง gif โดยไม่ตั้งใจ
  "image/gif",
  // วิดีโอ/เสียง: mirror ไฟล์แนบ (วิดีโอสั้น/ข้อความเสียง) จาก Messenger/IG (feature 00018) —
  // seller upload ปกติไม่แตะชนิดพวกนี้ (gate ด้วย CHAT_IMAGE_ALLOWED_EXT); ขนาดยัง cap ที่ MAX_SIZE
  // (วิดีโอใหญ่เกินจะ mirror ไม่ผ่าน → ตกไป placeholder ตามเดิม)
  "video/mp4",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "audio/webm",
  "application/pdf",
];

export type { ByteRange } from "@/lib/http-range";
import type { ByteRange } from "@/lib/http-range";

export type GetFileUrlOptions = {
  signed?: boolean;
  expiresIn?: number;
};

export type SaveFileOptions = {
  /** ข้าม validateUpload (ชนิด/ขนาดของ seller upload) — ใช้เฉพาะ path ที่ทำ validation เองแล้ว
   *  เช่น mirror ไฟล์แนบจาก Messenger/IG (มี host allow-list + streaming size cap ของตัวเอง).
   *  ext มาจาก file.name ตามเดิม (caller ตั้ง .ext ที่ถูกต้องมาแล้ว) */
  skipValidation?: boolean;
};

export interface Storage {
  saveFile(file: File, opts?: SaveFileOptions): Promise<string>;
  getFile(fileId: string): Promise<{ buffer: Buffer; ext: string } | null>;
  /** ขนาดไฟล์โดยไม่ดึงเนื้อไฟล์ — ต้องรู้ก่อนถึงจะประกอบ Content-Range ได้
   *  (เรียกเฉพาะตอนมี Range header เท่านั้น ไม่เพิ่ม round-trip ให้ request รูปปกติ) */
  getFileMeta(fileId: string): Promise<{ size: number; ext: string } | null>;
  /** ดึงเฉพาะช่วงไบต์ (inclusive ทั้งสองฝั่ง) สำหรับตอบ 206 Partial Content */
  getFileRange(
    fileId: string,
    range: ByteRange
  ): Promise<{ buffer: Buffer; ext: string } | null>;
  getFileUrl(fileId: string, opts?: GetFileUrlOptions): Promise<string>;
  deleteFile(fileId: string): Promise<void>;
}

export function validateUpload(file: File): void {
  if (file.size > MAX_SIZE) throw new Error("File too large");
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error("Invalid file type");
}

export function fileIdExt(fileId: string): string {
  return fileId.split(".").pop() || "bin";
}
