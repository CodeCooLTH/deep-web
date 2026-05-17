// In-memory rate-limit สำหรับ SMS code consume endpoint (RC-1)
//
// ต้องเป็น globalThis singleton — เหตุผลเดียวกับ src/lib/otp.ts:
// Next.js route handlers เป็นคนละ module instance → module-level Map ไม่ share กัน
// globalThis singleton = share ภายใน process เดียว (MVP; Phase-2 = Redis)
//
// RC-1 spec: per-IP ~10 fail/15min — throttle ก่อนที่ entropy 60-bit จะถูก brute
const globalForSmsConsumeRl = globalThis as unknown as {
  smsConsumeTimestamps?: Map<string, number[]>;
};

const smsConsumeTimestamps =
  globalForSmsConsumeRl.smsConsumeTimestamps ??
  (globalForSmsConsumeRl.smsConsumeTimestamps = new Map<string, number[]>());

/**
 * ตรวจว่า IP นี้ยังส่ง consume request ได้อยู่ไหม ภายใต้ quota
 * Return true = ผ่าน (ยังไม่เกิน), false = เกิน quota → caller render SmsErrorPage
 *
 * ไม่นับเฉพาะ "fail" — นับทุก attempt เพื่อกัน oracle enumeration (RC-2):
 * ถ้านับเฉพาะ fail จะเปิดช่อง: attacker รู้ว่าใช้ success slot ได้เท่าไหร่ก่อน throttle
 *
 * @param ip - IP จาก x-forwarded-for header (trim แล้ว)
 * @param max - จำนวนสูงสุดใน window (default 10)
 * @param windowMs - ขนาด window ms (default 15 นาที)
 */
export function checkSmsConsumeRateLimit(
  ip: string,
  max = 10,
  windowMs = 15 * 60 * 1000,
): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const prev = smsConsumeTimestamps.get(ip) ?? [];
  // ตัด timestamp เก่าออก (window trim)
  const recent = prev.filter((t) => t > cutoff);

  if (recent.length >= max) {
    smsConsumeTimestamps.set(ip, recent); // trim stale แต่ไม่เพิ่ม slot ใหม่
    return false; // เกิน quota
  }

  recent.push(now);
  smsConsumeTimestamps.set(ip, recent);
  return true; // ผ่าน
}
