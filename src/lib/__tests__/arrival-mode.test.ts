import { describe, expect, it } from 'vitest'

import {
  ARRIVAL_MODE_META,
  WALK_IN_WINDOW_MIN,
  arrivalChipMeta,
  arrivalModeOf,
  arrivalSummary,
  resolveArrivalMode,
} from '@/lib/arrival-mode'

/**
 * "ลูกค้ารายนี้เข้ามารับบริการยังไง" — คำถามของหัวหน้า 2026-08-15
 * ผิดที่นี่ = ร้านอ่านประวัติลูกค้าผิดว่าเป็นคนจองล่วงหน้าหรือเดินเข้ามา
 */
const at = (iso: string) => new Date(iso)

describe('resolveArrivalMode', () => {
  it('[blocker] ไม่มีเวลานัด → ยังไม่ระบุเวลา (งานหายจากตารางงาน)', () => {
    expect(
      resolveArrivalMode({ serviceStart: null, createdAt: at('2026-08-16T10:00:00+07:00') }),
    ).toBe('UNSCHEDULED')
    expect(
      resolveArrivalMode({ serviceStart: undefined, createdAt: at('2026-08-16T10:00:00+07:00') }),
    ).toBe('UNSCHEDULED')
  })

  it('[blocker] เวลานัด ≈ เวลาเปิดบิล → เดินเข้ามา', () => {
    /**
     * ปุ่ม "เริ่มงานเลย" ตั้ง serviceStart = เวลาที่กด ⇒ ส่วนต่างเป็น ~0 เสมอ
     * เกณฑ์นี้จึงจริงโดยการก่อสร้าง ไม่ได้พึ่งการเดา
     */
    expect(
      resolveArrivalMode({
        serviceStart: at('2026-08-16T10:05:00+07:00'),
        createdAt: at('2026-08-16T10:00:00+07:00'),
      }),
    ).toBe('WALK_IN')
  })

  it('[blocker] นัดล่วงหน้าหลายวัน → จองล่วงหน้า', () => {
    expect(
      resolveArrivalMode({
        serviceStart: at('2026-08-20T14:00:00+07:00'),
        createdAt: at('2026-08-16T10:00:00+07:00'),
      }),
    ).toBe('BOOKED')
  })

  it('[blocker] เปิดบิลย้อนหลังเล็กน้อย (ร้านยุ่ง) ยังเป็นเดินเข้ามา ไม่ใช่จองล่วงหน้า', () => {
    /**
     * ใช้ค่าสัมบูรณ์ — ถ้าเทียบทางเดียว บิลที่เปิด *หลัง* เวลานัด 10 นาที จะถูกอ่านเป็น
     * "จองล่วงหน้า" ซึ่งผิดความจริงไปคนละทาง
     */
    expect(
      resolveArrivalMode({
        serviceStart: at('2026-08-16T10:00:00+07:00'),
        createdAt: at('2026-08-16T10:10:00+07:00'),
      }),
    ).toBe('WALK_IN')
  })

  it('[blocker] ขอบพอดี 30 นาที = เดินเข้ามา · เกินไป 1 นาที = จองล่วงหน้า', () => {
    const created = at('2026-08-16T10:00:00+07:00')
    const edge = new Date(created.getTime() + WALK_IN_WINDOW_MIN * 60_000)
    const over = new Date(created.getTime() + (WALK_IN_WINDOW_MIN + 1) * 60_000)
    expect(resolveArrivalMode({ serviceStart: edge, createdAt: created })).toBe('WALK_IN')
    expect(resolveArrivalMode({ serviceStart: over, createdAt: created })).toBe('BOOKED')
  })

  it('[blocker] บิลที่เปิดย้อนหลังหลายวัน (feature 00033) ต้องไม่กลายเป็น "จองล่วงหน้า"', () => {
    /**
     * 🛑 เคสนี้คือตัวที่ mutation จับได้ว่าร่างแรกผิด — ร่างแรกใช้ `Math.abs` ⇒ ส่วนต่าง
     * ติดลบก้อนใหญ่ถูกอ่านเป็น "จองล่วงหน้า" ทั้งที่ร้านแค่มากรอกงานเมื่อวานทีหลัง
     * (ระบบให้ย้อนวันได้ถึง 90 วัน — `order-date-window.ts`)
     */
    expect(
      resolveArrivalMode({
        serviceStart: at('2026-08-10T09:00:00+07:00'),
        createdAt: at('2026-08-16T10:00:00+07:00'),
      }),
    ).toBe('WALK_IN')
  })

  it('รับ ISO string ได้เท่ากับรับ Date (แถวที่ข้าม RSC มาแล้วถือ ISO)', () => {
    const a = resolveArrivalMode({
      serviceStart: '2026-08-20T07:00:00.000Z',
      createdAt: '2026-08-16T03:00:00.000Z',
    })
    const b = resolveArrivalMode({
      serviceStart: new Date('2026-08-20T07:00:00.000Z'),
      createdAt: new Date('2026-08-16T03:00:00.000Z'),
    })
    expect(a).toBe(b)
  })

  it('วันที่เสีย → ตกไป UNSCHEDULED ไม่ใช่โยน error กลางหน้าจอ', () => {
    expect(resolveArrivalMode({ serviceStart: 'ไม่ใช่วันที่', createdAt: at('2026-08-16T10:00:00+07:00') })).toBe(
      'UNSCHEDULED',
    )
  })
})

describe('ARRIVAL_MODE_META', () => {
  it('[blocker] เฉพาะ "ยังไม่ระบุเวลา" เท่านั้นที่เป็นโทนเตือน — อีก 2 อันเป็นข้อเท็จจริง', () => {
    /**
     * โทนเตือนแปลว่า "ต้องลงมือ" — ใบที่ยังไม่ระบุเวลาหายจากตารางงานจริง ๆ จึงต้องเตือน
     * ส่วน "เดินเข้ามา"/"จองล่วงหน้า" เป็นแค่ข้อเท็จจริงว่าเกิดอะไรขึ้น ไม่มีอะไรให้ทำ
     * ถ้าย้อมสีทั้งสามอัน สีจะเลิกมีความหมาย
     */
    expect(ARRIVAL_MODE_META.UNSCHEDULED.cls).toContain('warning')
    expect(ARRIVAL_MODE_META.WALK_IN.cls).not.toContain('warning')
    expect(ARRIVAL_MODE_META.BOOKED.cls).not.toContain('warning')
  })

  it('ทุกโหมดต้องมีคำอธิบายที่บอกสิ่งที่เกิดขึ้น ไม่ใช่ชื่อเกณฑ์', () => {
    for (const m of Object.values(ARRIVAL_MODE_META)) {
      expect(m.label.length).toBeGreaterThan(0)
      expect(m.hint.length).toBeGreaterThan(10)
      expect(m.icon.length).toBeGreaterThan(0)
    }
  })
})

describe('arrivalSummary', () => {
  it('มีช่องทาง → ต่อท้าย · ไม่มี → ตัดวลีทิ้งทั้งก้อน', () => {
    expect(arrivalSummary('BOOKED', 'Facebook')).toBe('จองล่วงหน้า · จากFacebook')
    expect(arrivalSummary('BOOKED', null)).toBe('จองล่วงหน้า')
  })

  it('[blocker] ไม่มีช่องทาง ห้ามเติมคำว่า "ไม่ทราบ" — อ่านเหมือนระบบพัง', () => {
    expect(arrivalSummary('WALK_IN', null)).not.toMatch(/ไม่ทราบ|ไม่ระบุช่องทาง|unknown/i)
  })
})

describe('ทุกจอที่แสดง "วิธีเข้ารับ" ต้องใช้ตัวตัดสินเดียวกัน', () => {
  /**
   * 🛑 3 จอนี้ถูก render คนละที่คนละ breakpoint — คนทดสอบจอเดียวไม่มีวันเห็นอีก 2 จอ
   * ถ้าจอไหนตัดสินเองด้วย `serviceStart == null` ตรง ๆ วันหนึ่งชิปจะไม่ตรงกัน
   * โดยไม่มี tsc/build ตัวไหนฟ้อง (`sibling-surface-parity.md`)
   */
  const SURFACES = [
    ['แชท — การ์ดงาน', 'src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/OrderProgressBar.tsx'],
    ['ตารางงาน — การ์ดรายวัน', 'src/components/safepay/appointment-board/AppointmentDayCard.tsx'],
    ['หน้าออเดอร์ — การ์ดนัด', 'src/app/(paces)/seller/(dashboard)/orders/[token]/components/AppointmentCard.tsx'],
  ] as const

  for (const [name, path] of SURFACES) {
    it(`[blocker] ${name} — ต้องเรียก arrivalModeOf() (00086: ค่าที่ร้านเลือกชนะ)`, async () => {
      const { readFileSync } = await import('node:fs')
      const { join } = await import('node:path')
      const src = readFileSync(join(process.cwd(), path), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
      expect(src, 'ต้องเรียกตัวตัดสินกลาง').toContain('arrivalModeOf(')
      // สูตรตรง ๆ ข้ามค่าที่ร้านเลือก ⇒ ใบที่ "จองไว้แต่นัดใกล้เวลาเปิดบิล" จะขึ้นเป็นหน้าร้านผิด ๆ
      expect(src, 'ห้ามเรียกสูตรเดิมตรง ๆ ที่จอ').not.toContain('resolveArrivalMode(')
      // ต้องส่งค่าที่เก็บเข้าไปจริง — เรียก arrivalModeOf โดยไม่ส่ง arrivalMode = สูตรเดิมแฝง
      expect(src, 'ต้องส่ง arrivalMode เข้า arrivalModeOf').toMatch(/arrivalModeOf\(\{\s*arrivalMode/)
      // 00086 FR-002: ชิปอ่านผ่าน arrivalChipMeta (ซึ่งคืน ARRIVAL_MODE_META[mode]) — ทั้งสองทางคือ SSOT เดียว
      expect(src, 'คำ/สี/ไอคอน ต้องมาจาก ARRIVAL_MODE_META ห้ามพิมพ์เอง').toMatch(/ARRIVAL_MODE_META|arrivalChipMeta\(/)
    })
  }

  it('[blocker] คำว่า "เดินเข้ามา" ต้องไม่โผล่บนจอเลย — ป้ายแบบการมาคือ ARRIVAL_MODE_META.WALK_IN.label', async () => {
    /**
     * 00086 S-3: ป้ายเปลี่ยนเป็น "หน้าร้าน" · คำเดิมยังอยู่ในคอมเมนต์อธิบายที่มาได้ (ตัดคอมเมนต์ก่อนนับ)
     * แต่ถ้าโผล่ในโค้ดที่ render = มีจอที่พิมพ์คำเองแทนที่จะอ่านจาก META
     */
    const { readFileSync, readdirSync, statSync } = await import('node:fs')
    const { join } = await import('node:path')
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n)
        if (statSync(p).isDirectory()) return n === '__tests__' ? [] : walk(p)
        return p.endsWith('.tsx') && !/\.test\.tsx$/.test(p) ? [p] : []
      })
    const offenders = walk(join(process.cwd(), 'src')).filter((p) =>
      readFileSync(p, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
        .includes('เดินเข้ามา'),
    )
    expect(offenders).toEqual([])
  })

  it('[blocker] การ์ดตารางงานต้องได้ createdAt มาจริง ไม่ใช่เดาจาก start', async () => {
    /**
     * ระยะห่างระหว่าง "เวลานัด" กับ "เวลาเปิดบิล" คือสิ่งเดียวที่แยกสองโหมด —
     * ถ้า endpoint ไม่ส่ง `createdAt` มา การ์ดจะได้ `undefined` แล้วทุกใบกลายเป็น UNSCHEDULED
     */
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
    expect(read('src/services/appointment.service.ts'), 'service ต้อง select createdAt').toMatch(
      /orderNo: true,\s*\n\s*createdAt: true,/,
    )
    // 00086 P3 — การ serialize ย้ายไปตัวกลางที่ day + carry-over ใช้ร่วมกัน (appointment-day-payload.ts)
    expect(read('src/app/api/shops/current/appointments/day/route.ts'), 'route ต้องผ่านตัวกลาง').toContain(
      'toAppointmentDayPayload(items, gate.roles)',
    )
    expect(read('src/lib/appointment-day-payload.ts'), 'ตัวกลางต้อง serialize').toContain(
      'createdAt: i.createdAt.toISOString()',
    )
    expect(read('src/components/safepay/appointment-board/types.ts'), 'type ต้องมี createdAt').toMatch(
      /createdAt: string/,
    )
  })
})

describe('arrivalModeOf (feature 00086) — ค่าที่ร้านเลือก → สูตรเดิม → ยังไม่ระบุเวลา', () => {
  const created = at('2026-10-27T10:00:00+07:00')
  const farFuture = at('2026-10-30T10:00:00+07:00')
  const now = at('2026-10-27T10:01:00+07:00')

  it('[blocker] ค่าที่เก็บชนะสูตร — จองไว้แต่เวลาใกล้เปิดบิล ยังเป็น BOOKED · หน้าร้านแต่เลื่อนไปไกล ยังเป็น WALK_IN', () => {
    expect(arrivalModeOf({ arrivalMode: 'BOOKED', serviceStart: now, createdAt: created })).toBe('BOOKED')
    expect(arrivalModeOf({ arrivalMode: 'WALK_IN', serviceStart: farFuture, createdAt: created })).toBe('WALK_IN')
  })

  it('[blocker] ไม่มีค่าเก็บ (null/undefined) → สูตรเดิมเหมือน resolveArrivalMode ทุกกรณี', () => {
    for (const serviceStart of [null, now, farFuture]) {
      for (const arrivalMode of [null, undefined]) {
        expect(arrivalModeOf({ arrivalMode, serviceStart, createdAt: created })).toBe(
          resolveArrivalMode({ serviceStart, createdAt: created }),
        )
      }
    }
  })

  it('ค่าแปลกปลอม (ไม่อยู่ในชุด) ไม่ถูกเชื่อ → ตกไปสูตรเดิม', () => {
    expect(arrivalModeOf({ arrivalMode: 'LATER', serviceStart: farFuture, createdAt: created })).toBe('BOOKED')
    expect(arrivalModeOf({ arrivalMode: 'UNSCHEDULED', serviceStart: null, createdAt: created })).toBe('UNSCHEDULED')
  })

  it('[blocker] ป้ายหน้าร้าน = "หน้าร้าน" (00086) — ไม่ใช่ "เดินเข้ามา"', () => {
    expect(ARRIVAL_MODE_META.WALK_IN.label).toBe('หน้าร้าน')
  })
})

describe('arrivalChipMeta (00086 FR-002) — ชิปแบบการมาที่จองานบริการแสดง', () => {
  it('[blocker] จองล่วงหน้า + หน้าร้าน ⇒ ชิปทั้งคู่ (meta ชุดเดียวกับ ARRIVAL_MODE_META)', () => {
    expect(arrivalChipMeta('BOOKED')).toBe(ARRIVAL_MODE_META.BOOKED)
    expect(arrivalChipMeta('WALK_IN')).toBe(ARRIVAL_MODE_META.WALK_IN)
    expect(arrivalChipMeta('BOOKED')?.label).toBe('จองล่วงหน้า')
  })

  it('[blocker] ยังไม่ระบุเวลา ⇒ แสดงเฉพาะจอที่ขอ (แถบงานในแชท) · ค่าตั้งต้นไม่แสดง', () => {
    expect(arrivalChipMeta('UNSCHEDULED')).toBeNull()
    expect(arrivalChipMeta('UNSCHEDULED', { includeUnscheduled: true })).toBe(ARRIVAL_MODE_META.UNSCHEDULED)
  })

  it('ไม่มีค่า (ร้านอื่น/ไม่มีข้อมูล) ⇒ null', () => {
    expect(arrivalChipMeta(null)).toBeNull()
    expect(arrivalChipMeta(undefined, { includeUnscheduled: true })).toBeNull()
  })
})
