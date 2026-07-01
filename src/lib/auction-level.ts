/**
 * User Level (bidder level) — ladder mapping จาก successfulBidCount
 *
 * feature 00002 (Seller Auction) — SDS §6 / DATABASE.md §5.2 เป็น SSOT ของ threshold
 * pure function ล้วน (ไม่มี import prisma/DB) ตามที่ SDS ระบุ เพื่อให้ใช้ได้ทั้งฝั่ง
 * service (server) และ client component (seller console / buyer app) โดยไม่ต้อง query ซ้ำ
 */

export type AuctionLevel = {
  level: 1 | 2 | 3 | 4 | 5
  label: string
  icon: string
}

// เรียงจากสูงไปต่ำ — หา tier แรกที่ count >= min ของมัน (ตรงกับ ladder ใน DATABASE.md §5.2)
const LADDER: ReadonlyArray<{ min: number } & AuctionLevel> = [
  { min: 100, level: 5, label: 'ตำนาน', icon: 'tabler-crown' },
  { min: 30, level: 4, label: 'ระดับเพชร', icon: 'tabler-diamond' },
  { min: 10, level: 3, label: 'เซียน', icon: 'tabler-trophy' },
  { min: 3, level: 2, label: 'นักประมูล', icon: 'tabler-shield' },
  { min: 0, level: 1, label: 'มือใหม่', icon: 'tabler-podium' },
]

/**
 * แปล `successfulBidCount` (นับ "bid สำเร็จ" — ชนะ auction + Order ไม่ถูก cancel)
 * เป็น level/label/icon ตาม ladder — ไม่กระทบ Trust Score สูตรเดิม
 */
export function getAuctionLevel(successfulBidCount: number): AuctionLevel {
  // guard ค่า malformed (NaN/negative) → ปฏิบัติเป็น 0 กัน crash จุดแสดงผล
  const count = Number.isFinite(successfulBidCount) && successfulBidCount > 0 ? successfulBidCount : 0
  const tier = LADDER.find((t) => count >= t.min)!
  return { level: tier.level, label: tier.label, icon: tier.icon }
}
