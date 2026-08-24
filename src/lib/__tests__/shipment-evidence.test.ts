/**
 * [blocker] หลักฐานจากขนส่งสำหรับกรณีพิพาท (feature 00055 · หัวหน้าสั่ง 2026-08-24)
 *
 * ที่มา (วัดจาก prod วันเดียวกัน): `ShipmentEvent` 1,015 แถวมี payload ดิบ **0 แถว**
 * (webhook ของ iShip ไม่เคยยิงเลยสักครั้ง ทุกแถวเป็น POLL ซึ่งไม่บันทึก payload) และพัสดุ
 * ที่ยัง active 399 ใบ **ไม่มี event เลย 255 ใบ (64%)** เพราะไทม์ไลน์ถูกเขียนเฉพาะตอนมีคน
 * เอาเมาส์ไปวาง ⇒ วันที่ลูกค้าโต้แย้งว่า "ไม่เคยมีใครเอาของมาส่ง" เราไม่มีอะไรยืนยัน
 *
 * แดง = ห้าม merge
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

import {
  EVIDENCE_CARRIER_STATUSES,
  PROBLEM_CARRIER_STATUSES,
  RETURNED_CARRIER_STATUSES,
  shouldCaptureEvidence,
} from '../iship/status'

describe('shouldCaptureEvidence', () => {
  it('[blocker] ครอบทั้งชุด "มีปัญหา" และ "ตีกลับ" ครบทุกค่า', () => {
    for (const code of [...PROBLEM_CARRIER_STATUSES, ...RETURNED_CARRIER_STATUSES]) {
      expect(shouldCaptureEvidence(code), code).toBe(true)
    }
  })

  /**
   * 🛑 หัวหน้าสั่งชัดว่า "เก็บกรณีมีปัญหาเท่านั้น" — เก็บทุกใบคือค่าใช้จ่ายและ PII
   * (payload ของ get_order มีชื่อ/เบอร์/ที่อยู่ผู้รับดิบ ๆ) ที่ไม่มีใครได้ประโยชน์
   * พัสดุที่ส่งถึงตามปกติไม่มีใครโต้แย้ง
   */
  it('[blocker] เส้นทางปกติต้องไม่เก็บ — delivered/in_transit/payment_success', () => {
    for (const code of [
      'order_success',
      'picked_up',
      'with_branch',
      'in_transit',
      'progress',
      'delivered',
      'payment_success',
      'close',
      'no_courier',
    ]) {
      expect(shouldCaptureEvidence(code), code).toBe(false)
    }
  })

  it('[blocker] allow-list fail-closed — ไม่รู้จัก/ว่าง = ไม่เก็บ', () => {
    for (const v of ['', null, undefined, 'SOMETHING_NEW']) {
      expect(shouldCaptureEvidence(v as string | null), String(v)).toBe(false)
    }
  })

  it('cancelled อยู่ในชุดด้วย — ของไม่ถึงมือผู้รับและอาจมีเงิน/ของค้างอยู่', () => {
    expect(EVIDENCE_CARRIER_STATUSES).toContain('cancelled')
  })
})

describe('[blocker] จุดจุดชนวนและวินัยของตัวเก็บ', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/iship.service.ts'), 'utf8')
    // 🛑 ตัดคอมเมนต์ก่อนสแกน — ไฟล์นี้อธิบายกฎพวกนี้ไว้เองทุกข้อ
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')

  /**
   * 🛑 เคสที่เกือบหลุดจริงตอนเขียนรอบนี้: ร่างแรกรับ `shopId` เป็น optional บนอ็อบเจกต์ `s`
   * แต่ `select` ของชุด tracking ไม่ได้ดึงมา ⇒ `if (s.shopId && …)` เป็นเท็จตลอดกาล
   * ฟีเจอร์ตายเงียบโดยทุก gate เขียว (tsc ไม่ฟ้องเพราะ optional = "ไม่ส่งก็ได้")
   */
  it('[blocker] shopId ต้องเป็นพารามิเตอร์บังคับ ห้ามเป็น optional บนอ็อบเจกต์', () => {
    const i = src.indexOf('async function applyCarrierStatus')
    const sig = src.slice(i, src.indexOf('): Promise<boolean>', i))
    expect(sig).not.toMatch(/shopId\?:/)
    expect(sig).toMatch(/shopId:\s*string/)
  })

  it('ต้องเก็บที่ applyCarrierStatus — จุดเดียวที่รู้ว่า "สถานะเพิ่งเปลี่ยน"', () => {
    const i = src.indexOf('async function applyCarrierStatus')
    expect(i).toBeGreaterThan(-1)
    const fn = src.slice(i, src.indexOf('export async function syncShipmentStatuses', i))
    expect(fn).toContain('shouldCaptureEvidence(')
    expect(fn).toContain('captureShipmentEvidence(')
  })

  it('[blocker] ตัวเก็บห้ามโยน error ออกไปหาลูป sync', () => {
    const i = src.indexOf('async function captureShipmentEvidence')
    expect(i).toBeGreaterThan(-1)
    const fn = src.slice(i, src.indexOf('async function applyCarrierStatus', i))
    // ใบเดียวล้มต้องไม่ลากทั้งรอบตาย — พัสดุที่เหลือจะค้างสถานะโดยไม่มีใครรู้สาเหตุ
    expect(fn).not.toMatch(/\bthrow\s+(?!new Error\("ไม่มีเลขพัสดุ"\))/)
    expect(fn).toContain('catch')
  })

  it('[blocker] ดึงไม่ได้ต้องบันทึกแถวที่มี error ไม่ใช่ไม่บันทึกอะไรเลย', () => {
    const i = src.indexOf('async function captureShipmentEvidence')
    const fn = src.slice(i, src.indexOf('async function applyCarrierStatus', i))
    // "ไม่มีแถว" = ไม่เคยพยายาม ซึ่งคนละเรื่องกับ "พยายามแล้วขนส่งไม่ตอบ"
    expect(fn).toContain('error,')
    expect(fn).toContain('shipmentEvidence.create')
  })

  it('[blocker] ต้องเก็บ payload ดิบ ห้าม normalize ทิ้ง', () => {
    const i = src.indexOf('async function captureShipmentEvidence')
    const fn = src.slice(i, src.indexOf('async function applyCarrierStatus', i))
    expect(fn).toContain('traces')
    expect(fn).toContain('parcel')
  })
})

describe('[blocker] สคีมาของตารางหลักฐาน', () => {
  const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8')
  const model = schema.slice(
    schema.indexOf('model ShipmentEvidence'),
    schema.indexOf('model ShipmentPickup'),
  )

  it('มีตาราง ShipmentEvidence จริง', () => {
    expect(model.length).toBeGreaterThan(0)
  })

  it('[blocker] กันเก็บซ้ำที่ระดับฐาน ไม่ใช่ที่ลำดับของโค้ด', () => {
    // poller หลายรอบทับกันได้ ความถูกต้องต้องอยู่ที่ @unique เสมอ
    expect(model).toMatch(/@@unique\(\[shipmentId,\s*reason\]\)/)
  })

  it('[blocker] ต้องมีช่อง error — แยก "ไม่เคยพยายาม" ออกจาก "พยายามแล้วล้ม"', () => {
    expect(model).toMatch(/error\s+String\?/)
  })

  it('traceCount ต้องมี — 0 คือหลักฐานในตัวมันเอง (ขนส่งไม่มีบันทึกอะไรเลย)', () => {
    expect(model).toMatch(/traceCount\s+Int/)
  })
})

describe('[blocker] backfill ย้อนหลัง (BRD §6.5)', () => {
  const svc = readFileSync(join(process.cwd(), 'src/services/iship.service.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')
  const fn = svc.slice(
    svc.indexOf('export async function backfillShipmentEvidence'),
    svc.indexOf('async function applyCarrierStatus'),
  )

  it('มี backfill จริง — ไม่งั้นใบที่มีข้อพิพาทอยู่แล้วคือกลุ่มเดียวที่ไม่มีหลักฐาน', () => {
    expect(fn.length).toBeGreaterThan(0)
  })

  it('[blocker] ต้องกรองด้วยชุดเดียวกับตัวเก็บอัตโนมัติ ห้ามพิมพ์รายชื่อเอง', () => {
    expect(fn).toContain('EVIDENCE_CARRIER_STATUSES')
    expect(fn).not.toMatch(/'return_success'|'issue'|'cannot_pickup'/)
  })

  it('[blocker] ต้องข้ามใบที่เก็บไปแล้ว (idempotent — ยิงซ้ำได้)', () => {
    expect(fn).toMatch(/evidence:\s*\{\s*none:\s*\{\}\s*\}/)
  })

  /**
   * 🛑 ตัวเก็บกลืน error ไว้โดยเจตนา (ห้ามลากลูป sync ตาย) ⇒ "ไม่ throw" ไม่ได้แปลว่าสำเร็จ
   * ถ้าเดาจากการที่ไม่ throw รายงานจะบอกว่าสำเร็จ 15/15 ทั้งที่ทุกใบเก็บไม่ได้เลย
   */
  it('[blocker] ต้องอ่านผลกลับจากฐาน ไม่เดาจากการที่ไม่ throw', () => {
    expect(fn).toContain('shipmentEvidence.findUnique')
    expect(fn).toMatch(/saved\s*&&\s*!saved\.error/)
  })

  it('[blocker] ต้องมีเพดานต่อรอบ — แต่ละใบยิง iShip 2 คำขอ', () => {
    expect(fn).toMatch(/Math\.min\(/)
  })

  it('[blocker] รายงานต้องมีช่อง failed ไม่ใช่บอกแค่จำนวนที่สำเร็จ', () => {
    const route = readFileSync(
      join(process.cwd(), 'src/app/api/admin/iship/backfill-evidence/route.ts'),
      'utf8',
    )
    expect(fn).toContain('failed')
    // route ต้องเป็น admin-only — งานนี้อ่าน/เขียนข้ามร้านทั้งระบบ
    expect(route).toContain('requireAdmin(')
  })
})

describe('[blocker] หน้าจอดูหลักฐาน (BRD §6.7)', () => {
  const route = readFileSync(
    join(process.cwd(), 'src/app/api/orders/[token]/shipment-evidence/route.ts'),
    'utf8',
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')

  /**
   * 🛑 `parcel` คือ payload ดิบของ get_order ซึ่งมีชื่อ/เบอร์/ที่อยู่ผู้รับแบบไม่ตัดทอน
   * เก็บไว้เพื่อการสืบสวน ไม่ใช่เพื่อแสดงบนจอ — และร้านเห็นที่อยู่ของออเดอร์ตัวเองอยู่แล้ว
   * ในหน้าเดียวกัน การส่งก้อนดิบไปอีกทางจึงเพิ่มความเสี่ยงโดยไม่เพิ่มข้อมูล (BR-BR-22)
   *
   * ต้องกันที่ `select` ไม่ใช่ที่การ render — ค่าที่ดึงมาไหลเข้า payload ฟรี ๆ แม้จอไม่แสดง
   */
  it('[blocker] ห้าม serve คอลัมน์ parcel ออกไป', () => {
    const sel = route.slice(route.indexOf('select:'), route.indexOf('orderBy:'))
    expect(sel).not.toMatch(/\bparcel\b/)
    expect(sel).toContain('traces')
  })

  it('[blocker] ต้องกันสิทธิ์ด้วยร้านเจ้าของออเดอร์', () => {
    expect(route).toContain('canAccessShop(')
    expect(route).toContain('sessionUserId(')
    // ห้ามใช้ cast แบบเดิมที่ปิดตา ("มี session" ≠ "รู้ว่าเป็นใคร")
    expect(route).not.toMatch(/session\.user as any/)
  })

  it('[blocker] คำไทยของสถานะต้องมาจากตารางกลาง ห้ามพิมพ์เอง (HR16)', () => {
    expect(route).toContain('describeCarrierStatus(')
  })

  it('[blocker] การ์ดต้องไม่ขึ้นเมื่อไม่มีหลักฐาน — ไม่ใช่ขึ้นการ์ดเปล่า', () => {
    const panel = readFileSync(
      join(
        process.cwd(),
        'src/app/(paces)/seller/(dashboard)/orders/[token]/components/ShipmentEvidencePanel.tsx',
      ),
      'utf8',
    )
    expect(panel).toMatch(/if \(count <= 0\) return null/)
    const page = readFileSync(
      join(process.cwd(), 'src/app/(paces)/seller/(dashboard)/orders/[token]/page.tsx'),
      'utf8',
    )
    // นับที่ server ด้วย count ไม่ใช่ดึงแถวมาทั้งหมด — ออเดอร์ปกติต้องไม่จ่ายค่านั้น
    expect(page).toContain('shipmentEvidence.count(')
    expect(page).toMatch(/evidenceCount > 0 &&/)
  })
})
