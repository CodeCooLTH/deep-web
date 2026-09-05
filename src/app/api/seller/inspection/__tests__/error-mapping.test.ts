// [blocker] error ของ service ทุกตัวต้องมีปลายทาง HTTP จริง (feature 00060 · T9 · API §3.2 จ)
//
// 🛑 ตารางใน API.md §5 ไม่ใช่ "รายการความตั้งใจ" — โค้ดที่ไม่มี catch จริงจะตกไป 500 แล้วผู้ใช้
//    เห็น "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง" กับสิ่งที่ไม่มีทางสำเร็จด้วยการลองใหม่
//    (memory `feedback_service_error_route_mapping` · rule-must-be-enforced-not-described.md)

import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

const { PLAN_ERROR_TO_CODE, mapInspectionError, errorResponse } = await import('../_shared')
const { InspectionPlanError } = await import('@/services/inspection-plan.service')
const { InspectionEvidenceError } = await import('@/services/inspection-result.service')

/** อ่านชุดโค้ดจาก **ซอร์สจริง** ไม่ใช่รายชื่อที่คัดลอกมา — รายชื่อที่คัดลอกจะค้างอยู่ที่เดิม */
function unionMembers(file: string, typeName: string): string[] {
  const src = readFileSync(join(process.cwd(), file), 'utf8')
  const start = src.indexOf(`export type ${typeName} =`)
  expect(start, `หา type ${typeName} ไม่เจอใน ${file}`).toBeGreaterThan(-1)
  const body = src.slice(start, src.indexOf('\n\n', start))
  return [...body.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]!)
}

describe('ความครบของการแมป error', () => {
  it('🛑 mutation: เพิ่ม error code ใหม่ใน service โดยไม่แมป → เคสนี้ต้องแดง', () => {
    const codes = unionMembers('src/services/inspection-plan.service.ts', 'InspectionPlanErrorCode')
    expect(codes.length).toBeGreaterThan(5)
    const unmapped = codes.filter((c) => !(c in PLAN_ERROR_TO_CODE))
    expect(unmapped, `ยังไม่มีปลายทาง HTTP: ${unmapped.join(', ')}`).toEqual([])
  })

  it('error ของหลักฐานทุกตัวใช้ชื่อเดียวกับโค้ดใน API §5 ตรงตัว', async () => {
    const codes = unionMembers('src/services/inspection-result.service.ts', 'InspectionEvidenceErrorCode')
    for (const code of codes) {
      const res = mapInspectionError(new InspectionEvidenceError(code as 'UNKNOWN_CHECK_KEY'), { tag: 't' })
      expect(res.status, code).not.toBe(500)
      expect((await res.json()).error).toBe(code)
    }
  })
})

describe('สถานะที่ห้ามเพี้ยน', () => {
  it('เครดิตไม่พอ = 402 ไม่ใช่ 400 (client แยก "ไปเติมเงิน" ออกจาก "แก้ข้อมูลที่กรอก" ด้วยสถานะนี้)', async () => {
    const res = mapInspectionError(new Error('INSUFFICIENT_CREDIT'), { tag: 't' })
    expect(res.status).toBe(402)
    expect((await res.json()).error).toBe('INSUFFICIENT_CREDIT')
  })

  it('🛑 ราคายังไม่เคาะ → ตอบเป็นเรื่องที่อธิบายได้ ไม่ใช่ 500 ที่ชวนให้กดซ้ำ', async () => {
    const res = mapInspectionError(new Error('PRICING_NOT_DECIDED'), { tag: 't' })
    expect(res.status).toBe(409)
    expect((await res.json()).message).toContain('ยังไม่เปิด')
  })

  it('🛑 mutation: ตอบ QUOTA_FULL โดยไม่บอกวันเปิดรับรอบถัดไป → เคสนี้ต้องแดง (AC-INS-09-2)', async () => {
    const now = new Date('2026-09-05T03:00:00.000Z')
    const res = mapInspectionError(new InspectionPlanError('INTAKE_QUOTA_FULL'), { tag: 't', step: 3, now })
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.error).toBe('QUOTA_FULL')
    expect(body.details.nextOpenAt).toBe('2026-09-30T17:00:00.000Z') // 1 ต.ค. 2569 00:00 น. เวลาไทย
    expect(body.message).toMatch(/เปิดรับรอบถัดไป/)
  })

  it('🛑 "ยังไม่เปิดรับ" ต้องพูดคนละอย่างกับ "เต็มแล้ว" แม้สถานะเท่ากัน', async () => {
    const now = new Date('2026-09-05T03:00:00.000Z')
    const full = await mapInspectionError(new InspectionPlanError('INTAKE_QUOTA_FULL'), { tag: 't', now }).json()
    const notOpen = await mapInspectionError(new InspectionPlanError('INTAKE_NOT_OPEN'), { tag: 't', now }).json()
    // วันที่ทีมลืมตั้งโควตา ทุกขั้นจะขึ้นว่า "เต็ม" ทั้งที่ยังไม่มีใครสมัครสักคน แล้วจะไม่มีใคร
    // เอะใจไปสืบ เพราะคำว่าเต็มเป็นคำอธิบายที่ฟังขึ้นสมบูรณ์
    expect(full.message).not.toBe(notOpen.message)
    expect(notOpen.message).toMatch(/ยังไม่เปิดรับ/)
  })

  it('error ที่ไม่รู้จัก → 500 และไม่หลุดรายละเอียดออกไป', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = mapInspectionError(new Error('boom: fileId=secret'), { tag: 't' })
    const body = await res.json()
    expect(res.status).toBe(500)
    expect(JSON.stringify(body)).not.toContain('secret')
    spy.mockRestore()
  })

  it('errorResponse คืนรูปเดียวกันทุกตัว (error/message) ตามโครงมาตรฐานของโมดูล', async () => {
    const body = await errorResponse('NOT_OWNER').json()
    expect(Object.keys(body).sort()).toEqual(['error', 'message'])
  })
})
