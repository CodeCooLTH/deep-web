/**
 * src/lib/media-hash.ts — เนื้อหา (feature 00051 Chat Media Deduplication, S-2, TFR-CMD-01)
 *
 * pure function ล้วน — ห้าม import prisma (convention ของ repo: `lib/*` ไม่แตะ prisma,
 * ดู scope baseline S-2 "ไม่ทำ") เพื่อให้ hash ใช้ได้ทั้งจาก media-asset.service.ts,
 * scripts/backfill-media-dedup.ts, และเทส โดยไม่ลาก DB client เข้ามาด้วย
 */
import { createHash } from "crypto";

/**
 * sha256 เต็ม 32 ไบต์ (hex 64 ตัวอักษร) ไม่ตัดทอน — NFR-CMD-03 ระบุชัดว่า "1 ไบต์ต่าง = คนละไฟล์"
 * ดังนั้นห้าม slice() ผลลัพธ์เหมือน customer-row-key.ts (ที่นั่นตัดทอนได้เพราะเป็นแค่ grouping key
 * ไม่ใช่ ตัวตัดสินความเหมือนของเนื้อไฟล์แบบนี้)
 */
export function sha256Hex(buf: Buffer | ArrayBuffer): string {
  const buffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return createHash("sha256").update(buffer).digest("hex");
}
