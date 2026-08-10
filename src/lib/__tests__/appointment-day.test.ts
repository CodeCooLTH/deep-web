/**
 * appointment-day — เทส [blocker] ของนิยาม "นัดของวันนี้"
 *
 * ทำไมต้องมี: ไทล์ "นัดวันนี้" บนหน้าแรกนับที่ฝั่ง DB (`appointmentDayWhere` → prisma.count)
 * ส่วนหน้า `/orders?apptDay=today` กรองที่ฝั่ง client (`appointmentOverlapsDay`) — คนละภาษา
 * คนละเครื่อง ถ้าเพี้ยนจากกันเมื่อไหร่ ผู้ใช้จะกดไทล์ที่บอก 6 แล้วเข้าไปเจอ 5 โดยไม่มีอะไรฟ้อง
 * (BR-SOV-06 — อาการเดียวกับที่ deriveShippingStage เคยเจอ)
 *
 * เทสนี้จึงไม่ได้เช็คแค่ว่า "predicate ตอบถูก" แต่เดิน **ทั้งสองทางบน fixture ชุดเดียวกัน**
 * แล้วบังคับให้ผลตรงกันทุกแถว — โดยตีความ where fragment ด้วย evaluator เล็ก ๆ ในไฟล์นี้
 * (รีโปไม่มี DB ให้เทสแตะ — HR13)
 *
 * 🛑 แดงเมื่อไหร่ห้าม merge
 *
 * พิสูจน์ด้วย mutation แล้ว (2026-08-10 — คืนตรรกะผิดกลับไปแล้วต้องแดงจริง ไม่ใช่แค่เขียนให้เขียว):
 *   `gt: from` → `gte: from` ในสาขาแรกของ appointmentDayWhere  → แดง 1 (เฉพาะเทสเทียบสองฝั่ง
 *      เพราะฝั่ง client ยังถูก — นี่คือเคสที่เทสนี้มีไว้จับโดยเฉพาะ)
 *   `start < toMs` → `<=` ใน appointmentOverlapsDay             → แดง 2 (เทสรายแถว + เทียบสองฝั่ง)
 *   ถอด `status === 'CANCELLED'` ออกจาก predicate               → แดง 2 (เทสรายแถว + เทียบสองฝั่ง)
 */

import { describe, expect, it } from 'vitest'
import {
  appointmentDayBounds,
  appointmentDayWhere,
  appointmentOverlapsDay,
  isAppointmentDayKey,
} from '../appointment-day'

/** 2026-08-10 12:00 น. เวลาไทย — กลางวันพอดี กันเคสที่ผลเปลี่ยนตามเวลาที่รันเทส */
const NOW = new Date('2026-08-10T05:00:00.000Z')

/** helper อ่านง่าย: เวลาไทยของวันที่ระบุ → Date (UTC+7) */
const th = (iso: string) => new Date(`${iso}+07:00`)

type Row = {
  name: string
  serviceStart: Date | null
  serviceEnd: Date | null
  status: string
  expected: boolean
}

const ROWS: Row[] = [
  {
    name: 'นัดเช้าวันนี้ 09:00–10:00',
    serviceStart: th('2026-08-10T09:00:00'),
    serviceEnd: th('2026-08-10T10:00:00'),
    status: 'PENDING',
    expected: true,
  },
  {
    name: 'นัดข้ามคืน เมื่อวาน 22:00 → วันนี้ 01:00',
    serviceStart: th('2026-08-09T22:00:00'),
    serviceEnd: th('2026-08-10T01:00:00'),
    status: 'PENDING',
    expected: true,
  },
  {
    name: 'นัดทั้งวันของวันนี้ (00:00–24:00)',
    serviceStart: th('2026-08-10T00:00:00'),
    serviceEnd: th('2026-08-11T00:00:00'),
    status: 'PENDING',
    expected: true,
  },
  {
    name: 'นัดหลายวันที่คร่อมวันนี้ตรงกลาง (8 ส.ค. → 12 ส.ค.)',
    serviceStart: th('2026-08-08T09:00:00'),
    serviceEnd: th('2026-08-12T18:00:00'),
    status: 'PENDING',
    expected: true,
  },
  {
    name: 'นัดพรุ่งนี้เช้า',
    serviceStart: th('2026-08-11T09:00:00'),
    serviceEnd: th('2026-08-11T10:00:00'),
    status: 'PENDING',
    expected: false,
  },
  {
    name: 'นัดเมื่อวานเช้า',
    serviceStart: th('2026-08-09T09:00:00'),
    serviceEnd: th('2026-08-09T10:00:00'),
    status: 'PENDING',
    expected: false,
  },
  {
    // ข้อมูลเก่าก่อนมี serviceEnd — ต้องยังนับได้ ไม่ใช่หายไปเงียบ ๆ
    name: 'ไม่มี serviceEnd แต่เริ่มวันนี้',
    serviceStart: th('2026-08-10T09:00:00'),
    serviceEnd: null,
    status: 'PENDING',
    expected: true,
  },
  {
    name: 'ไม่มี serviceEnd และเริ่มพรุ่งนี้',
    serviceStart: th('2026-08-11T09:00:00'),
    serviceEnd: null,
    status: 'PENDING',
    expected: false,
  },
  {
    // ใบยกเลิกไม่ใช่ "นัดของวันนี้" — ป้ายบนไทล์คือของที่ต้องทำ/ทำไปแล้ว ไม่ใช่ของที่ถูกยกเลิก
    name: 'นัดวันนี้แต่ออเดอร์ถูกยกเลิก',
    serviceStart: th('2026-08-10T09:00:00'),
    serviceEnd: th('2026-08-10T10:00:00'),
    status: 'CANCELLED',
    expected: false,
  },
  {
    name: 'ใบที่ไม่มีนัดเลย (walk-in)',
    serviceStart: null,
    serviceEnd: null,
    status: 'PENDING',
    expected: false,
  },
  {
    // ขอบ half-open: จบพอดีเที่ยงคืนไทย = ยังเป็นของเมื่อวาน
    name: 'นัดเมื่อวาน 23:00 จบพอดีเที่ยงคืนวันนี้',
    serviceStart: th('2026-08-09T23:00:00'),
    serviceEnd: th('2026-08-10T00:00:00'),
    status: 'PENDING',
    expected: false,
  },
  {
    // ขอบ half-open อีกด้าน: เริ่มพอดีเที่ยงคืนพรุ่งนี้ = ของพรุ่งนี้
    name: 'นัดเริ่มพอดีเที่ยงคืนพรุ่งนี้',
    serviceStart: th('2026-08-11T00:00:00'),
    serviceEnd: th('2026-08-11T02:00:00'),
    status: 'PENDING',
    expected: false,
  },
]

// ─── evaluator ของ where fragment ────────────────────────────────────────────
// ตีความเฉพาะรูปแบบที่ appointmentDayWhere ใช้จริง (not/gt/gte/lt/null/OR) — ถ้าวันหนึ่งมีคนเติม
// operator ใหม่เข้าไปโดยไม่แก้ที่นี่ เทสจะโยน ไม่ใช่ผ่านเงียบ ๆ
type Cmp = Record<string, unknown>

function matchesLeaf(value: unknown, cond: unknown): boolean {
  if (cond === null) return value === null
  if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime()
  if (typeof cond === 'object') {
    const c = cond as Cmp
    for (const [op, operand] of Object.entries(c)) {
      switch (op) {
        case 'not':
          if (operand === null) {
            if (value === null || value === undefined) return false
          } else if (value === operand) return false
          break
        case 'gt':
          if (!(value instanceof Date) || value.getTime() <= (operand as Date).getTime()) return false
          break
        case 'gte':
          if (!(value instanceof Date) || value.getTime() < (operand as Date).getTime()) return false
          break
        case 'lt':
          if (!(value instanceof Date) || value.getTime() >= (operand as Date).getTime()) return false
          break
        default:
          throw new Error(`evaluator ไม่รู้จัก operator "${op}" — เติม case ให้ครบก่อน merge`)
      }
    }
    return true
  }
  return value === cond
}

function matchesWhere(where: Record<string, unknown>, row: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'OR') {
      const branches = cond as Record<string, unknown>[]
      if (!branches.some((b) => matchesWhere(b, row))) return false
      continue
    }
    if (!matchesLeaf(row[key], cond)) return false
  }
  return true
}

// ─── เทส ─────────────────────────────────────────────────────────────────────

describe('[blocker] appointment-day — นิยาม "นัดของวันนี้"', () => {
  it('ขอบวันคิดตามปฏิทินไทย ไม่ใช่ UTC', () => {
    const { from, to } = appointmentDayBounds('today', NOW)
    // 2026-08-10 00:00 น. เวลาไทย = 2026-08-09T17:00Z
    expect(from.toISOString()).toBe('2026-08-09T17:00:00.000Z')
    expect(to.toISOString()).toBe('2026-08-10T17:00:00.000Z')
  })

  it('รับเฉพาะคีย์ที่รู้จัก (ค่าอื่น = ไม่กรอง fail-open)', () => {
    expect(isAppointmentDayKey('today')).toBe(true)
    expect(isAppointmentDayKey('tomorrow')).toBe(false)
    expect(isAppointmentDayKey(null)).toBe(false)
    expect(isAppointmentDayKey('')).toBe(false)
  })

  describe('predicate ฝั่ง client ให้ผลตามที่คาด', () => {
    for (const row of ROWS) {
      it(`${row.expected ? 'นับ' : 'ไม่นับ'}: ${row.name}`, () => {
        expect(
          appointmentOverlapsDay(
            {
              startISO: row.serviceStart?.toISOString() ?? null,
              endISO: row.serviceEnd?.toISOString() ?? null,
              status: row.status,
            },
            'today',
            NOW,
          ),
        ).toBe(row.expected)
      })
    }
  })

  /**
   * หัวใจของไฟล์นี้ — where ที่ส่งให้ prisma กับ predicate ที่รันบนเบราว์เซอร์ต้องเห็นตรงกัน
   * ทุกแถว ไม่ใช่แค่ "แต่ละตัวถูกในสายตาคนเขียนของตัวเอง"
   */
  it('where ฝั่ง DB กับ predicate ฝั่ง client ให้ผลตรงกันทุกแถว', () => {
    const where = appointmentDayWhere('today', NOW) as unknown as Record<string, unknown>

    for (const row of ROWS) {
      const fromDb = matchesWhere(where, {
        serviceStart: row.serviceStart,
        serviceEnd: row.serviceEnd,
        status: row.status,
      })
      const fromClient = appointmentOverlapsDay(
        {
          startISO: row.serviceStart?.toISOString() ?? null,
          endISO: row.serviceEnd?.toISOString() ?? null,
          status: row.status,
        },
        'today',
        NOW,
      )
      expect(
        { row: row.name, fromDb, fromClient },
        `นิยามสองฝั่งไม่ตรงกันที่แถว "${row.name}"`,
      ).toEqual({ row: row.name, fromDb: row.expected, fromClient: row.expected })
    }
  })

  it('endISO ที่ parse ไม่ได้ ถอยไปใช้สาขา "มีแต่จุดเริ่ม" ไม่ใช่ตกทั้งแถว', () => {
    expect(
      appointmentOverlapsDay(
        { startISO: th('2026-08-10T09:00:00').toISOString(), endISO: 'ไม่ใช่วันที่', status: 'PENDING' },
        'today',
        NOW,
      ),
    ).toBe(true)
  })

  it('ไม่ส่ง status มา = ไม่ตัดใบยกเลิกให้ (ห้ามเดาแทนผู้เรียก)', () => {
    expect(
      appointmentOverlapsDay(
        {
          startISO: th('2026-08-10T09:00:00').toISOString(),
          endISO: th('2026-08-10T10:00:00').toISOString(),
        },
        'today',
        NOW,
      ),
    ).toBe(true)
  })
})
