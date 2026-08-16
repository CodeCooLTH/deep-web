/**
 * 00049 AI Command Center — ค่าคงที่ + ตรรกะบริสุทธิ์ที่ทั้ง service และ UI ใช้ร่วมกัน
 *
 * ทำไมต้องแยกไฟล์: `stageFromLabels()` คือ boolean/ตัวเลือกที่ **ตัดสินว่าใบงานโผล่คอลัมน์ไหน**
 * ถ้าเขียนกลับด้านแล้วจะไม่มีอะไรจับได้เลย — `tsc`/build/theme-guard ผ่านหมดเพราะชนิดถูกทุกตัว
 * สิ่งที่ผิดคือ *ความหมาย* (`docs/conventions/ui-boolean-needs-a-testable-home.md`)
 * ⇒ ต้องอยู่ใน `src/lib/**` เป็นฟังก์ชันบริสุทธิ์ + มีเทส `[blocker]` + พิสูจน์ด้วย mutation
 */

/** ป้ายขั้น ⑦ — Controller ติดเมื่อ `safepay-docs` จบ แปลว่า "สายพานจบ รอ user กด" */
export const READY_STAGE_LABEL = "stage:ready"

/** 🛑 ประตูอนุมัติเดียวของทั้งระบบ — user เท่านั้นที่ติดได้ และ `auto-merge.yml` อ่านตัวนี้ */
export const APPROVED_LABEL = "พร้อมขึ้น"

/** ป้ายที่ `watchdog.yml` ใช้หา issue แจ้งเตือนใบเดิม (SDS TD-004) */
export const WATCHDOG_LABEL = "hermes:offline"

/**
 * 🛑 ต้องตรงเป๊ะกับ `auto-merge.yml` ด่าน 5 (`grep '^prisma/migrations/'`)
 * ไม่งั้นจอบอกว่า "ไม่แตะ migration" แต่ด่านไม่ยอม merge — ผู้ใช้จะเห็นสองคำตอบที่ขัดกัน (HR16)
 */
export const MIGRATION_PATH_RE = /^prisma\/migrations\//

export type Stage = "plan" | "ux" | "build" | "review" | "qa" | "docs" | "ready"

/** เรียงตามสายพานจริง — "รอเคาะ" ขวาสุด ไม่ใช่ซ้ายสุด (UX spec §7.1) */
export const STAGE_COLUMNS: ReadonlyArray<{
  stage: Stage
  label: string
  agent: string | null
}> = [
  { stage: "plan", label: "วางแผน", agent: "safepay-planner" },
  { stage: "ux", label: "UX", agent: "safepay-ux" },
  { stage: "build", label: "เขียน", agent: "safepay-developer" },
  { stage: "review", label: "รีวิว", agent: "safepay-reviewer" },
  { stage: "qa", label: "QA", agent: "safepay-qa" },
  { stage: "docs", label: "เอกสาร", agent: "safepay-docs" },
  // ขั้น ⑦ ไม่มี agent — เป็นของ user (D-10)
  { stage: "ready", label: "รอเคาะ", agent: null },
]

const STAGE_BY_LABEL = new Map<string, Stage>([
  ["stage:plan", "plan"],
  ["stage:ux", "ux"],
  ["stage:build", "build"],
  ["stage:review", "review"],
  ["stage:qa", "qa"],
  ["stage:docs", "docs"],
  [READY_STAGE_LABEL, "ready"],
])

/**
 * ตัดสินว่าใบงานอยู่คอลัมน์ไหนจากรายชื่อป้ายสด
 *
 * - ไม่มีป้ายที่รู้จักเลย → `null` = **ไม่แสดงบนบอร์ด** (TFR-CC-13 ข้อ 3)
 * - `พร้อมขึ้น` → `ready` เสมอ **แม้ยังมีป้าย `stage:*` เก่าติดอยู่** เพราะใบที่ user เคาะแล้ว
 *   กำลังจะถูก merge — แสดงในคอลัมน์ที่ยังไม่จบจะทำให้คนไปแตะงานที่ปิดไปแล้ว
 * - ใบที่มีทั้ง `stage:ready` และ `พร้อมขึ้น` ตกที่ `ready` เหมือนกัน ⇒ **นับครั้งเดียว** (SDS TD-006)
 *
 * 🛑 fail-closed กับป้ายที่ไม่รู้จัก: ป้ายใหม่ที่ไม่มีในตารางนี้ไม่ทำให้ใบงานหลุดไปคอลัมน์มั่ว
 *    (`enum-value-removal.md` — ตรรกะ binary ไม่พังเสียงดังเมื่อค่าที่ 3 มา จึงต้องเป็น allow-list)
 */
export function stageFromLabels(labels: readonly string[]): Stage | null {
  if (labels.includes(APPROVED_LABEL)) return "ready"
  for (const l of labels) {
    const stage = STAGE_BY_LABEL.get(l)
    if (stage) return stage
  }
  return null
}

export type BoardItem = {
  number: number
  kind: "issue" | "pr"
  title: string
  url: string
  stage: Stage
  stageEnteredAt: string | null
  touchesMigration: boolean
  /** `true` = ยังไม่ถูกเคาะ (ปุ่ม "เคาะ" ผูกกับกลุ่มนี้) · `false` = เคาะแล้ว รอ `auto-merge.yml` */
  awaitingApproval: boolean
}

export type BoardColumn = {
  stage: Stage
  label: string
  agent: string | null
  count: number
  items: BoardItem[]
}

export type BoardResponse = {
  columns: BoardColumn[]
  generatedAt: string
  degraded: boolean
  degradedSince: string | null
}

export type HeartbeatResponse = {
  lastHeartbeatAt: string | null
  ageSeconds: number | null
  watchdogIssue: { open: boolean; url: string | null; number: number | null }
}

/**
 * เลข "รอเคาะ" บนแถบสถานะบน
 *
 * 🛑 นับเฉพาะใบที่ **ยังไม่ถูกเคาะ** ไม่ใช่ `count` ของคอลัมน์ `ready` — ไม่งั้นเลขจะไม่ลดลง
 * หลังกด แล้วผู้ใช้จะกดซ้ำใบเดิม · เลขนี้กับปุ่มบนการ์ดต้องมาจาก symbol เดียวกัน
 * (`sibling-surface-parity.md` — จอเดียวเคยโชว์ "ยังไม่ตอบ" 7 กับ 8 พร้อมกันมาแล้ว)
 */
export function countAwaitingApproval(columns: readonly BoardColumn[]): number {
  return columns.reduce(
    (n, col) => n + col.items.filter((i) => i.awaitingApproval).length,
    0,
  )
}
