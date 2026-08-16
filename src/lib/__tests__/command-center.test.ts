/**
 * [blocker] ตรรกะที่ตัดสินว่าใบงานโผล่คอลัมน์ไหน และเลข "รอเคาะ" นับจากอะไร
 *
 * ทำไมต้องเป็น `[blocker]`: ทั้งสองฟังก์ชันเป็น "boolean/ตัวเลือกที่ตัดสิน UI" ซึ่งเขียนกลับด้าน
 * แล้ว **ไม่มี gate ไหนของโปรเจกต์จับได้เลย** — `tsc`/`next build`/theme-guard/detector ผ่านหมด
 * เพราะชนิดถูกทุกตัวอักษร สิ่งที่ผิดคือ *ความหมาย*
 * (`docs/conventions/ui-boolean-needs-a-testable-home.md` — guard ปุ่ม "ย่อกลับ" เคยเขียนกลับด้าน
 * แล้วปุ่มไม่ทำงานเลยทุกกรณี ผ่านทุกด่าน)
 *
 * เคสที่แพงที่สุดถ้าพัง: ใบที่ user เคาะแล้วยังนับเป็น "รอเคาะ" → เลขไม่ลด → กดซ้ำใบเดิม
 * และใบที่จบขั้น docs หายจากบอร์ด → ไม่มีใครรู้ว่ามีงานรออนุมัติอยู่ (เหตุผลทั้งหมดที่ D-10 มีอยู่)
 */

import { describe, it, expect } from "vitest"
import {
  stageFromLabels,
  countAwaitingApproval,
  STAGE_COLUMNS,
  APPROVED_LABEL,
  READY_STAGE_LABEL,
  MIGRATION_PATH_RE,
  type BoardColumn,
  type BoardItem,
} from "@/lib/command-center"

describe("[blocker] stageFromLabels — ใบงานอยู่คอลัมน์ไหน", () => {
  it("ป้ายขั้นปกติ → คอลัมน์ตรงตัว", () => {
    expect(stageFromLabels(["stage:plan"])).toBe("plan")
    expect(stageFromLabels(["stage:ux"])).toBe("ux")
    expect(stageFromLabels(["stage:build"])).toBe("build")
    expect(stageFromLabels(["stage:review"])).toBe("review")
    expect(stageFromLabels(["stage:qa"])).toBe("qa")
    expect(stageFromLabels(["stage:docs"])).toBe("docs")
  })

  it("stage:ready → คอลัมน์ ready (ขั้น ⑦ ที่ไม่มี agent)", () => {
    expect(stageFromLabels([READY_STAGE_LABEL])).toBe("ready")
  })

  it("พร้อมขึ้น → ready", () => {
    expect(stageFromLabels([APPROVED_LABEL])).toBe("ready")
  })

  /* 🛑 เคสหลักของ D-10: ใบที่ Controller ติด stage:ready แล้ว user กดเคาะ จะมีทั้ง 2 ป้าย
     ถ้าโผล่ 2 คอลัมน์ = งานใบเดียวถูกนับสองครั้งทั้งบอร์ดและตัวเลขบนหัว */
  it("มีทั้ง stage:ready และ พร้อมขึ้น → ready ใบเดียว ไม่ซ้ำ", () => {
    expect(stageFromLabels([READY_STAGE_LABEL, APPROVED_LABEL])).toBe("ready")
    expect(stageFromLabels([APPROVED_LABEL, READY_STAGE_LABEL])).toBe("ready")
  })

  /* ใบที่ user เคาะระหว่างที่ยังค้างป้ายขั้นเก่า (เช่น เคาะเองบน GitHub ตอนอยู่ stage:qa)
     ต้องไป ready ไม่ใช่ค้าง qa — มันกำลังจะถูก merge คนไม่ควรไปแตะงานที่ปิดไปแล้ว */
  it("พร้อมขึ้น ชนะป้ายขั้นเก่าที่ยังค้างอยู่", () => {
    expect(stageFromLabels(["stage:qa", APPROVED_LABEL])).toBe("ready")
    expect(stageFromLabels(["stage:build", APPROVED_LABEL])).toBe("ready")
  })

  it("ไม่มีป้ายที่รู้จัก → null (ไม่แสดงบนบอร์ด)", () => {
    expect(stageFromLabels([])).toBeNull()
    expect(stageFromLabels(["bug", "documentation"])).toBeNull()
    // ป้าย override/watchdog ไม่ใช่ป้ายสายพาน ไม่ควรลากใบขึ้นบอร์ดเอง
    expect(stageFromLabels(["แตะด่าน"])).toBeNull()
    expect(stageFromLabels(["hermes:offline"])).toBeNull()
  })

  /* allow-list ไม่ใช่ prefix match — ป้ายใหม่ที่ขึ้นต้น stage: แต่ไม่มีในตาราง
     ต้องไม่ทำให้ใบงานหลุดไปคอลัมน์มั่ว (`enum-value-removal.md`) */
  it("ป้าย stage:* ที่ไม่รู้จัก → null ไม่ใช่เดาคอลัมน์", () => {
    expect(stageFromLabels(["stage:deploy"])).toBeNull()
    expect(stageFromLabels(["stage:"])).toBeNull()
  })
})

function item(over: Partial<BoardItem>): BoardItem {
  return {
    number: 1,
    kind: "pr",
    title: "t",
    url: "u",
    stage: "ready",
    stageEnteredAt: null,
    touchesMigration: false,
    awaitingApproval: false,
    ...over,
  }
}

function col(stage: BoardColumn["stage"], items: BoardItem[]): BoardColumn {
  return { stage, label: stage, agent: null, count: items.length, items }
}

describe("[blocker] countAwaitingApproval — เลข 'รอเคาะ' บนหัวจอ", () => {
  /* 🛑 ถ้านับจาก count ของคอลัมน์ ready เลขจะไม่ลดหลังกด → ผู้ใช้กดซ้ำใบเดิม */
  it("นับเฉพาะใบที่ยังไม่ถูกเคาะ ไม่ใช่ทั้งคอลัมน์", () => {
    const columns = [
      col("ready", [
        item({ number: 1, awaitingApproval: true }),
        item({ number: 2, awaitingApproval: false }), // เคาะแล้ว รอ merge
        item({ number: 3, awaitingApproval: true }),
      ]),
    ]
    expect(countAwaitingApproval(columns)).toBe(2)
  })

  it("คอลัมน์อื่นไม่ถูกนับ", () => {
    const columns = [
      col("build", [item({ number: 9, stage: "build", awaitingApproval: false })]),
      col("ready", [item({ number: 1, awaitingApproval: true })]),
    ]
    expect(countAwaitingApproval(columns)).toBe(1)
  })

  it("ไม่มีอะไรรอ → 0 (สถานะดี ไม่ใช่ error)", () => {
    expect(countAwaitingApproval([col("ready", [])])).toBe(0)
    expect(countAwaitingApproval([])).toBe(0)
  })
})

describe("[blocker] ค่าคงที่ที่ต้องตรงกับ workflow", () => {
  /* regex นี้ต้องตรงเป๊ะกับ auto-merge.yml ด่าน 5 ไม่งั้นจอบอกว่าไม่แตะ migration
     แต่ด่านไม่ยอม merge — ผู้ใช้เห็นสองคำตอบที่ขัดกันโดยไม่มีอะไรอธิบาย (HR16) */
  it("MIGRATION_PATH_RE จับ prisma/migrations/ ที่ต้นทางเท่านั้น", () => {
    expect(MIGRATION_PATH_RE.test("prisma/migrations/20260816_x/migration.sql")).toBe(true)
    expect(MIGRATION_PATH_RE.test("prisma/schema.prisma")).toBe(false)
    // ต้องยึดที่ต้นสตริง ไม่ใช่ substring กลางทาง
    expect(MIGRATION_PATH_RE.test("docs/prisma/migrations/readme.md")).toBe(false)
  })

  it("มีครบ 7 คอลัมน์ เรียงตามสายพาน และ ready ขวาสุดไม่มี agent", () => {
    expect(STAGE_COLUMNS.map((c) => c.stage)).toEqual([
      "plan",
      "ux",
      "build",
      "review",
      "qa",
      "docs",
      "ready",
    ])
    expect(STAGE_COLUMNS.at(-1)?.agent).toBeNull()
    // 6 ขั้นแรกต้องมี agent จริงทุกตัว — คอลัมน์ที่ไม่มีเจ้าของคือคอลัมน์ที่งานไปค้าง
    expect(STAGE_COLUMNS.slice(0, 6).every((c) => Boolean(c.agent))).toBe(true)
  })
})
