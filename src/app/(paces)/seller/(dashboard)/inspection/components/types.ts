// types.ts — รูปร่าง payload ที่ข้าม RSC boundary ของหน้า "แผนการตรวจสอบ" ฝั่งร้าน (feature 00060 · T12)
//
// 🛑 จงใจให้ตรงกับ JSON shape ของ `GET /api/seller/inspection` (API.md §4.1) เป๊ะ — ทั้ง field name
//    และประเภทค่า (Date → ISO string) เพราะ response ของ POST subscribe/upgrade/cancel ก็เป็น
//    รูปร่างเดียวกัน (บางส่วน) — client แค่ merge ผลลัพธ์กลับเข้า state เดิมโดยไม่ต้องแปลงคนละแบบ
//
// ห้าม derive `displayStatus` ที่นี่หรือใน component ใด ๆ ใต้โฟลเดอร์นี้ (API.md §3.2 ค /
// Hard Rule ของ Controller) — ค่าที่เห็นทั้งหมดมาจาก server แล้ว

import type { InspectionCheckKey, InspectionStep } from '@/lib/inspection/checks'

export type ApiDisplayStatus = 'PASS' | 'FAIL' | 'RECHECK_DUE' | 'NO_DATA' | 'NOT_APPLICABLE'
export type ApiOutcome = 'PASS' | 'FAIL' | 'NOT_APPLICABLE'
export type ApiLapsedReason = 'RENEWAL_FAILED' | 'OWNER_CANCELLED'

export type CheckResultJSON = {
  checkKey: InspectionCheckKey
  displayStatus: ApiDisplayStatus
  /** "ตรวจล่าสุด" — 🛑 ห้ามสลับกับ outcomeSince (API.md §3.2 ค) */
  lastCheckedAt: string | null
  /** "ผลเป็นแบบนี้ตั้งแต่" */
  outcomeSince: string | null
  expiresAt: string | null
  inspectorDisplayName: string | null
}

export type RoomResultJSON = {
  roomId: string
  roomName: string
  results: CheckResultJSON[]
}

export type TimelineEntryJSON = {
  roundId: string
  step: InspectionStep
  method: string
  roomId: string | null
  roomName: string | null
  completedAt: string
  inspectorDisplayName: string
  changedResults: { checkKey: InspectionCheckKey; outcome: ApiOutcome; outcomeSince: string }[]
  confirmedCheckKeys: InspectionCheckKey[]
}

export type PendingRoundJSON = {
  roundId: string
  step: InspectionStep
  method: string
  roomId: string | null
  roomName: string | null
  assignedAt: string
  inspectorDisplayName: string
}

export type InspectionPlanJSON = {
  step: InspectionStep
  status: 'ACTIVE' | 'LAPSED'
  termsAcceptedAt: string | null
  lapsedReason: ApiLapsedReason | null
  effectiveAt: string | null
  /** สิ้นรอบบิลปัจจุบัน = วันตัดเงินรอบถัดไป */
  nextRenewalAt: string
  /** เส้นตายผ่อนผันเมื่อหักเครดิตไม่ผ่าน · null = ไม่ได้ค้างชำระ */
  graceUntil: string | null
  /** วันคงเหลือของช่วงผ่อนผัน — server คำนวณให้ (AC-INS-08-3 ต้องนับถอยหลังให้ร้านเห็น) */
  graceDaysLeft: number | null
} | null

export type IntakeJSON = { stepAvailable: InspectionStep[]; nextOpenAt: string | null }

/** รูปร่างเต็มของ `GET /api/seller/inspection` — ใช้ hydrate ทั้งหน้าครั้งแรกจาก RSC */
export type OwnerInspectionViewJSON = {
  plan: InspectionPlanJSON
  canManage: boolean
  shopResults: CheckResultJSON[]
  roomResults: RoomResultJSON[]
  timeline: TimelineEntryJSON[]
  pendingRounds: PendingRoundJSON[]
  intake: IntakeJSON
}
