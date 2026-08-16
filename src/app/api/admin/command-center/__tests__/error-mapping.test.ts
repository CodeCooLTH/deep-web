/**
 * [blocker] ทุก error class ที่ service โยน ต้องมี branch เจาะจงในตัว mapper
 * และทุก route ต้องมี admin gate + ตัว mapper จริง
 *
 * API.md §5 สั่งด่านนี้ไว้ตรงตัว: *"ไม่ใช่แค่ 'มี try/catch' เฉย ๆ ต้องมี branch เจาะจงต่อ
 * error class"* — กัน `feedback_service_error_route_mapping` ซ้ำ (00003 P2 `OutOfStockError`
 * เคยตกหล่นจนคืน 500 แทน 400 คือ error ที่ผู้ใช้แก้เองได้ กลายเป็น "ระบบพัง")
 *
 * ทำไมต้องอ่านซอร์ส: การพิสูจน์ mapping ที่แท้จริงต้องยิง GitHub จริงหรือ mock ทั้ง `fetch`
 * ซึ่งพิสูจน์ได้แค่เส้นที่เทสนึกออก — ส่วนที่พังจริงคือ **class ใหม่ที่เพิ่มทีหลังแล้วลืม map**
 * ซึ่งจับได้ด้วยการเทียบรายชื่อจากซอร์สเท่านั้น (ไม่ hardcode รายชื่อ class ในเทสนี้
 * เพราะ class ที่เพิ่มพรุ่งนี้ต้องถูกตรวจด้วยโดยไม่มีใครต้องมาแก้เทส)
 *
 * 🛑 TD-005: route handler เป็นคนละ request pipeline ไม่ผ่าน `(dashboard)/layout.tsx` เลย
 *    route ที่ลืม `requireAdmin()` = user ที่ล็อกอินแต่ไม่ใช่ admin ยิง curl ตรงได้
 */

import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const ROUTE_ROOT = join(ROOT, "src/app/api/admin/command-center")
const SERVICE = join(ROOT, "src/services/command-center.service.ts")
const SHARED = join(ROUTE_ROOT, "_shared.ts")

/** ชื่อ error class ทุกตัวที่ service โยนจริง — ดึงจากซอร์ส ไม่ใช่รายชื่อที่เขียนมือ */
function thrownErrorClasses(): string[] {
  const src = readFileSync(SERVICE, "utf8")
  const names = new Set<string>()
  const re = /throw new ([A-Za-z]+Error)\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) names.add(m[1])
  return [...names].sort()
}

function routeFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        if (entry === "__tests__") continue
        walk(full)
      } else if (entry === "route.ts") out.push(full)
    }
  }
  walk(ROUTE_ROOT)
  return out.sort()
}

describe("[blocker] cross-file error mapping ครบทุก class", () => {
  it("service โยน error อย่างน้อย 1 ชนิด (กันเทสเขียวเพราะ regex ไม่เจออะไรเลย)", () => {
    // ถ้า regex พัง รายชื่อจะว่าง แล้วลูปข้างล่างจะไม่ตรวจอะไรเลยแต่ยังเขียว — ปิดช่องนั้นตรงนี้
    expect(thrownErrorClasses().length).toBeGreaterThanOrEqual(4)
  })

  it("ทุก class ที่ service โยน มี instanceof branch ใน _shared.ts", () => {
    const shared = readFileSync(SHARED, "utf8")
    for (const cls of thrownErrorClasses()) {
      expect(shared, `ไม่มี branch สำหรับ ${cls} — จะตกไป 500 ทั้งที่ควรเป็น status เฉพาะ`).toMatch(
        new RegExp(`instanceof\\s+${cls}\\b`),
      )
    }
  })

  it("mapper คืน status ที่ต่างกันจริง ไม่ใช่ 500 ทั้งหมด", () => {
    const shared = readFileSync(SHARED, "utf8")
    for (const status of [409, 404, 502, 503]) {
      expect(shared, `mapper ไม่เคยคืน ${status}`).toContain(`status: ${status}`)
    }
  })
})

describe("[blocker] ทุก route มี admin gate และใช้ mapper กลาง", () => {
  it("เจอ route ครบ 6 ไฟล์", () => {
    expect(routeFiles().length).toBe(6)
  })

  it.each(routeFiles().map((f) => [f.slice(ROOT.length + 1), f]))(
    "%s — requireAdmin() + 403",
    (_name, file) => {
      const src = readFileSync(file as string, "utf8")
      expect(src).toMatch(/await requireAdmin\(\)/)
      expect(src).toContain("status: 403")
    },
  )

  it.each(routeFiles().map((f) => [f.slice(ROOT.length + 1), f]))(
    "%s — ส่ง error ต่อให้ mapper ไม่กลืนเอง",
    (_name, file) => {
      const src = readFileSync(file as string, "utf8")
      expect(src).toContain("mapCommandCenterError")
    },
  )
})
