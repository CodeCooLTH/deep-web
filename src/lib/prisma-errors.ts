/**
 * ตัวตรวจ error ของ Postgres ที่ Prisma ไม่ได้ map เป็น error code ของตัวเอง
 *
 * ยกออกมาจาก booking.service.ts (feature 00017) ตอนทำ feature 00024
 * เพราะมีผู้ใช้สองฟีเจอร์แล้ว — ตัวตรวจแบบนี้ถ้ามีสองสำเนาจะ drift แน่นอน
 * (บทเรียน feedback_spike_must_match_production_path: helper แกะ error ต้องทน 2 รูป)
 */

/**
 * ตรวจ error ของ EXCLUDE constraint (Postgres SQLSTATE 23P01)
 *
 * IMPORTANT: Prisma ไม่ map เป็น P2002 (unique) — วัดจริงบน DB แล้วได้
 * PrismaClientKnownRequestError { code: 'P2010', meta: { code: '23P01', message: ... } }
 * แต่ model call อาจถูกห่อเป็น Unknown ต่างจาก raw จึงไม่ผูกกับ class ใด class เดียว
 *
 * วัดจริงสองรอบ:
 *   - feature 00017 (daterange, 2026-07-22) — docs 00017 DATABASE.md §4.2.1
 *   - feature 00024 (tstzrange + seat, 2026-07-30) — docs 00024 DATABASE.md §4.2.1
 */
export function isExclusionViolation(err: unknown): boolean {
  const meta = (err as { meta?: { code?: string; message?: string } })?.meta;
  if (meta?.code === "23P01") return true;
  const text = `${meta?.message ?? ""} ${(err as Error)?.message ?? ""}`;
  return /23P01|exclusion constraint/i.test(text);
}

/**
 * ตรวจ error ของ FK ที่ถูก RESTRICT (Postgres SQLSTATE 23503 → Prisma P2003)
 * ใช้ตอนพยายามลบแถวที่ยังมีของอ้างอิงอยู่ เช่น ลบทรัพยากรที่ยังมีนัด (BR-RSV-08)
 */
export function isForeignKeyRestrictViolation(err: unknown): boolean {
  const e = err as { code?: string; meta?: { code?: string; message?: string } };
  if (e?.code === "P2003") return true;
  if (e?.meta?.code === "23503") return true;
  const text = `${e?.meta?.message ?? ""} ${(err as Error)?.message ?? ""}`;
  return /23503|foreign key constraint/i.test(text);
}
