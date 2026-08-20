// feature 00022 — เลือกพัสดุที่ "หลุดหน้าต่าง query_orders" มาถามรายใบด้วย get_order
//
// 🛑 ที่มา (user เจอบน prod 2026-08-20 — TH068661575518 ขนส่ง SPX):
// รอบ sync ยกชุดขอ `query_orders` ย้อนหลังได้สูงสุด 6 วัน (iShip ตอบ code 1009 ถ้าเกิน 7)
// พัสดุที่ไม่อยู่ในคำตอบจะเจอ `if (!row) continue` ในลูป sync = **สถานะค้างตรงนั้นตลอดกาล**
// โดยไม่มี error ไม่มี log ไม่มีอะไรฟ้องเลย ใบตัวอย่างค้างที่ "พัสดุตีกลับ" อยู่ 8 วัน
// ทั้งที่ขนส่งส่งของคืนถึงร้านเรียบร้อยแล้วตั้งแต่ 12 ส.ค.
//
// และ "การตีกลับ" คือเส้นทางที่กินเวลาเกิน 6 วันแทบทุกใบตามธรรมชาติของมัน (ส่งไป → ลูกค้า
// ไม่รับ → ขนส่งถือไว้ → ตีกลับ → ถึงต้นทาง) ⇒ ใบที่ระบบต้องรีบบอกร้านว่า "ของกลับมาแล้ว
// ต้องตัดสินใจเรื่องเงิน" คือใบที่ระบบเงียบใส่นานที่สุด
//
// 🛑 ยิง cron ถี่ขึ้นแก้ข้อนี้ไม่ได้ — เป็นปัญหา *ขอบเขตของข้อมูลที่ขอ* ไม่ใช่ *ความถี่ที่ถาม*
// ถามทุก 5 นาทีก็ได้คำตอบชุดเดิมที่ไม่มีใบนี้อยู่ทุกรอบ ทางเดียวคือถามรายใบด้วย `get_order`
// ซึ่งไม่มีเงื่อนไขวันที่เลย (และเราพิสูจน์จากเอกสารไม่ได้ด้วยว่า `start_date` กรองด้วย
// วันสร้างหรือวันอัปเดต — เอกสาร iShip เป็น Postman documenter ที่ดึงเนื้อหาไม่ได้
// ตัวนี้จึงถูกออกแบบให้ถูกต้องภายใต้ทั้งสองความหมาย)
//
// ทำไมต้องมีเพดาน: `get_order` เป็นคำขอ "รายใบ" ปล่อยไม่จำกัด = ร้านที่มีใบค้าง 80 ใบจะ
// กลายเป็น 80 คำขอทุกรอบ sync ตลอดไป ซึ่งเป็นเหตุผลทั้งหมดที่ระบบเลือก `query_orders`
// แบบยกชุดตั้งแต่แรก (ดูคอมเมนต์ที่ `iship.client.queryOrders`)

/** จำนวนใบที่ยอมถามรายตัวต่อรอบ sync — เพดานต้นทุน ไม่ใช่เป้าความครบ */
export const STALE_LOOKUP_MAX_PER_ROUND = 8;

/**
 * อายุที่เลิกตาม — พัสดุที่ไม่ขยับมา 45 วันคือใบที่จบเรื่องไปแล้วในโลกจริง
 * (ไม่มีเส้นทางขนส่งในประเทศไหนใช้เวลาขนาดนั้น) ถ้าไม่มีเส้นนี้ ใบที่ค้างถาวรจะอยู่ในคิว
 * ตลอดไปและกินโควตาของใบที่ยังเดินอยู่จริง
 */
export const STALE_LOOKUP_MAX_AGE_DAYS = 45;

export interface StaleLookupCandidate {
  trackingNo: string | null;
  carrierStatusAt: Date | null;
  createdAt: Date;
}

/**
 * pickStaleParcelsForLookup — ใบไหนควรถูกถามรายตัวในรอบนี้
 *
 * `seenTrackingNos` = เลขพัสดุที่ `query_orders` ตอบกลับมาแล้วรอบนี้ (ถามซ้ำ = เปลืองเปล่า)
 *
 * **เรียงใหม่ก่อน แล้วหมุนคิวเมื่อล้นเพดาน** — สองอย่างนี้ตอบคนละคำถามและต้องมีทั้งคู่:
 *
 * - เรียงใหม่ก่อน = ใบที่เพิ่งขยับล่าสุดมีโอกาสขยับต่อสูงสุด ควรได้คิวก่อน
 * - หมุนคิว = ถ้าเอาแต่ 8 ใบแรกทุกรอบ ใบที่ 9 เป็นต้นไปจะ **ไม่มีวันถูกถามเลยสักครั้ง**
 *   ซึ่งคือบั๊กเดิมย้ายที่อยู่ (จากใบที่หลุดหน้าต่างวันที่ กลายเป็นใบที่หลุดท้ายคิว)
 *   การหมุนด้วย "ช่วงเวลา" แทนการจำว่าใครถูกถามไปแล้ว ทำให้ไม่ต้องเพิ่มคอลัมน์ในฐาน
 *   และได้ผลเหมือนกันคือทุกใบถูกถามครบภายใน ceil(n / max) รอบ
 */
export function pickStaleParcelsForLookup<T extends StaleLookupCandidate>(
  parcels: T[],
  seenTrackingNos: Set<string>,
  now: Date,
  opts?: { max?: number; maxAgeDays?: number; rotationMs?: number },
): T[] {
  const max = Math.max(0, opts?.max ?? STALE_LOOKUP_MAX_PER_ROUND);
  const maxAgeDays = opts?.maxAgeDays ?? STALE_LOOKUP_MAX_AGE_DAYS;
  const rotationMs = opts?.rotationMs ?? 15 * 60 * 1000;
  if (max === 0) return [];

  const oldestAllowed = now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000;

  const ordered = parcels
    .filter((p) => p.trackingNo && !seenTrackingNos.has(p.trackingNo))
    .map((p) => ({ p, movedAt: lastMovedAt(p) }))
    .filter(({ movedAt }) => movedAt >= oldestAllowed)
    // ตัวตัดสินที่สองเป็น trackingNo เพื่อให้ลำดับนิ่ง — ใบที่ movedAt เท่ากันต้องไม่สลับ
    // ที่กันเองระหว่างรอบ ไม่งั้นการหมุนคิวจะข้ามบางใบไปเรื่อย ๆ
    .sort((a, b) => b.movedAt - a.movedAt || (a.p.trackingNo! < b.p.trackingNo! ? -1 : 1))
    .map(({ p }) => p);

  if (ordered.length <= max) return ordered;

  const rounds = Math.ceil(ordered.length / max);
  const bucket = Math.floor(now.getTime() / rotationMs) % rounds;
  return ordered.slice(bucket * max, bucket * max + max);
}

/**
 * "ขยับล่าสุดเมื่อไร" — ใช้ createdAt แทนเมื่อยังไม่เคยมีสถานะจากขนส่งเลย
 *
 * ห้ามตีใบที่ `carrierStatusAt` เป็น null ว่าเก่าที่สุด: นั่นคือใบที่ "เพิ่งเปิดแล้วขนส่ง
 * ยังไม่สแกน" ซึ่งเป็นใบใหม่เอี่ยม การจับมันไปท้ายแถวคือการเลิกตามใบที่กำลังจะขยับพอดี
 */
function lastMovedAt(p: StaleLookupCandidate): number {
  return (p.carrierStatusAt ?? p.createdAt).getTime();
}
