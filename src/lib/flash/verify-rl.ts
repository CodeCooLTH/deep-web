// feature 00084 security M1 — กันเดา secretKey ของ Flash ผ่าน /connection และ /connection/verify
// globalThis singleton เหมือน src/lib/sms-consume-rl.ts (route handler คนละ module instance) · MVP ใน process เดียว
// shortcut: ต่อ instance ไม่ใช่ทั้ง cluster, อัปเกรดเป็น Redis เมื่อ scale หลาย instance
// นับเฉพาะ "ล้มเพราะ key" (1001/1002) — ผิดเพราะเครือข่าย/Flash ล่มไม่ควรทำให้ร้านโดนล็อก
const g = globalThis as unknown as { flashVerifyFailures?: Map<string, number[]> };
const failures = g.flashVerifyFailures ?? (g.flashVerifyFailures = new Map<string, number[]>());

export const FLASH_VERIFY_MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

const recent = (key: string) => {
  const cutoff = Date.now() - WINDOW_MS;
  const r = (failures.get(key) ?? []).filter((t) => t > cutoff);
  if (r.length) failures.set(key, r);
  else failures.delete(key);
  return r;
};

/** true = ล้มครบโควตาแล้ว ห้ามยิง Flash ต่อ */
export const isFlashVerifyLimited = (userId: string, shopId: string): boolean =>
  recent(`${userId}:${shopId}`).length >= FLASH_VERIFY_MAX_FAILURES;

export function recordFlashVerifyFailure(userId: string, shopId: string): void {
  const key = `${userId}:${shopId}`;
  failures.set(key, [...recent(key), Date.now()]);
}
