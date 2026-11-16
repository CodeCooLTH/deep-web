// 00095 TC-030..037 — นิยามข้อความ: corpus เดียวผ่านทั้งรูป Prisma where และรูป SQL (parity) · ตัวประเมินเล็ก ๆ ในไฟล์นี้
// ตัวประเมินจำลองตรรกะสามค่าของ SQL (NULL = unknown) เพราะประเด็นหลักคือ NOT LIKE/<> ทิ้งแถว NULL — ถ้าใช้ JS ตรง ๆ จะมองไม่เห็น
// ข้อจำกัด: ไม่ใช่ Postgres จริง — เทส DB จริงอยู่ฝั่ง S-3/S-9 (HR13/14 ต้องปักหมุดฐาน localhost)
import { describe, expect, it } from 'vitest'
import { AUTO_ORDER_RESULT_TYPE, FOLLOW_BOT_NOTE_TYPE, INTERNAL_MESSAGE_TYPES, META_NOTICE_TYPE } from '../../auto-order-message-type'
import { AUTO_FOLLOW_KIND } from '../../auto-reply-constants'
import { DAY_MS } from '../constants'
import {
  compareMsgPos,
  countedShopReplySql,
  countedShopReplyWhere,
  customerRepliedAfterBot,
  isAwaitingShop,
  messageLookbackSince,
  realBuyerMsgSql,
  realBuyerMsgWhere,
} from '../message-defs'

type Tri = boolean | null
type Row = Record<string, string | boolean | number | null>

// ── Prisma where → ตรรกะสามค่า ──
const and3 = (xs: Tri[]): Tri => (xs.includes(false) ? false : xs.includes(null) ? null : true)
const or3 = (xs: Tri[]): Tri => (xs.includes(true) ? true : xs.includes(null) ? null : false)
const not3 = (x: Tri): Tri => (x === null ? null : !x)
const arr = <T>(x: T | T[]): T[] => (Array.isArray(x) ? x : [x])

function evalWhere(w: Record<string, unknown>, row: Row): Tri {
  return and3(
    Object.entries(w).map(([k, v]): Tri => {
      if (k === 'AND') return and3(arr(v as Record<string, unknown>[]).map((x) => evalWhere(x, row)))
      if (k === 'OR') return or3(arr(v as Record<string, unknown>[]).map((x) => evalWhere(x, row)))
      if (k === 'NOT') return not3(evalWhere(v as Record<string, unknown>, row))
      const val = row[k]
      if (v === null) return val === null
      if (typeof v !== 'object') return val === null ? null : val === v
      return and3(
        Object.entries(v as Record<string, unknown>).map(([op, arg]): Tri => {
          if (val === null || val === undefined) return null
          switch (op) {
            case 'not': return val !== arg
            case 'notIn': return !(arg as unknown[]).includes(val)
            case 'in': return (arg as unknown[]).includes(val)
            case 'startsWith': return String(val).startsWith(String(arg))
            case 'gte': return new Date(String(val)).getTime() >= new Date(arg as Date).getTime()
            default: throw new Error(`op ไม่รองรับ: ${op}`)
          }
        }),
      )
    }),
  )
}

// ── SQL fragment → ตรรกะสามค่า (เซตย่อยที่ message-defs ใช้) ──
const TOKEN = /\s*(?:(\w+\."(\w+)")|('(?:[^']|'')*')|(>=|<>|=|\(|\)|,)|(\w+))/y
function tokenize(sql: string): string[] {
  const out: string[] = []
  TOKEN.lastIndex = 0
  let m: RegExpExecArray | null
  while (TOKEN.lastIndex < sql.length && (m = TOKEN.exec(sql))) out.push(m[2] ? `col:${m[2]}` : m[3] ?? m[4] ?? m[5])
  return out
}
function evalSql(sql: string, row: Row): Tri {
  const t = tokenize(sql)
  let i = 0
  const peek = (n = 0) => t[i + n]
  const eat = (s?: string) => {
    if (s !== undefined && t[i]?.toUpperCase() !== s) throw new Error(`คาด ${s} เจอ ${t[i]} @${i} ใน ${sql}`)
    return t[i++]
  }
  const operand = (): string | boolean | number | null => {
    const x = eat()
    if (x.startsWith('col:')) return row[x.slice(4)] as never
    if (x.startsWith("'")) return x.slice(1, -1).replace(/''/g, "'")
    if (/^false$/i.test(x)) return false
    if (/^true$/i.test(x)) return true
    throw new Error(`operand ไม่รองรับ ${x}`)
  }
  const cmpTime = (a: unknown, b: unknown) => new Date(String(a)).getTime() - new Date(String(b)).getTime()
  const like = (v: string, pat: string) => new RegExp(`^${pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`).test(v)
  function primary(): Tri {
    if (peek() === '(') {
      eat('(')
      const r = orExpr()
      eat(')')
      return r
    }
    const l = operand()
    const kw = eat().toUpperCase()
    if (kw === '=') { const r = operand(); return l === null || r === null ? null : l === r }
    if (kw === '>=') { const r = operand(); return l === null || r === null ? null : cmpTime(l, r) >= 0 }
    if (kw === 'IS') {
      let neg = false
      if (peek().toUpperCase() === 'NOT') { eat(); neg = true }
      if (peek().toUpperCase() === 'NULL') { eat(); return neg ? l !== null : l === null }
      eat('DISTINCT'); eat('FROM')
      const r = operand()
      const distinct = l !== r // NULL-safe
      return neg ? !distinct : distinct
    }
    let neg = false
    let k = kw
    if (k === 'NOT') { neg = true; k = eat().toUpperCase() }
    if (k === 'IN') {
      eat('(')
      const list: unknown[] = [operand()]
      while (peek() === ',') { eat(','); list.push(operand()) }
      eat(')')
      if (l === null) return null
      return neg ? !list.includes(l) : list.includes(l)
    }
    if (k === 'LIKE') { const p = operand() as string; return l === null ? null : neg ? !like(String(l), p) : like(String(l), p) }
    throw new Error(`ไม่รองรับ ${kw} @${i}`)
  }
  function andExpr(): Tri {
    const xs = [primary()]
    while (peek()?.toUpperCase() === 'AND') { eat(); xs.push(primary()) }
    return and3(xs)
  }
  function orExpr(): Tri {
    const xs = [andExpr()]
    while (peek()?.toUpperCase() === 'OR') { eat(); xs.push(andExpr()) }
    return or3(xs)
  }
  const r = orExpr()
  if (i !== t.length) throw new Error(`ค้าง token ที่ ${i}/${t.length} ใน ${sql}`)
  return r
}

const NOW = new Date('2026-11-20T03:00:00.000Z')
const iso = (ms: number) => new Date(NOW.getTime() + ms).toISOString()
const SINCE = `'${messageLookbackSince(NOW).toISOString()}'`

const row = (o: Partial<Row>): Row => ({
  senderRole: 'BUYER',
  isDeleted: false,
  type: 'TEXT',
  externalMessageId: null,
  autoReplyKind: null,
  deliveryStatus: null,
  createdAt: iso(-DAY_MS),
  ...o,
})

const BUYER: [string, Row, boolean][] = [
  ['BUYER ปกติ', row({}), true],
  ['BUYER ถูกลบ', row({ isDeleted: true }), false],
  ['BUYER type=AUTO_ORDER_RESULT', row({ type: AUTO_ORDER_RESULT_TYPE }), false],
  ['BUYER type=META_NOTICE', row({ type: META_NOTICE_TYPE }), false],
  ['BUYER type=FOLLOW_BOT_NOTE', row({ type: FOLLOW_BOT_NOTE_TYPE }), false],
  ['BUYER LINE postback pb:evt123', row({ externalMessageId: 'pb:evt123' }), false],
  ['BUYER externalMessageId=NULL', row({ externalMessageId: null }), true],
  ['BUYER mid.xyz', row({ externalMessageId: 'mid.xyz' }), true],
  ['BUYER มี "pb:" กลางสตริง ไม่ใช่นำหน้า', row({ externalMessageId: 'x-pb:1' }), true],
  ['BUYER รูปภาพ', row({ type: 'IMAGE' }), true],
  ['SHOP ข้อความ', row({ senderRole: 'SHOP' }), false],
  ['ขอบ 30 วัน: ใหม่กว่า 1 วิ', row({ createdAt: iso(-30 * DAY_MS + 1000) }), true],
  ['ขอบ 30 วัน: เก่ากว่า 1 วิ', row({ createdAt: iso(-30 * DAY_MS - 1000) }), false],
]

const shop = (o: Partial<Row>): Row => row({ senderRole: 'SHOP', ...o })
const SHOP_REPLY: [string, Row, boolean][] = [
  ['SHOP ปกติ (คนพิมพ์)', shop({ deliveryStatus: 'SENT' }), true],
  ['echo Business Suite/Meta AI (kind null)', shop({ autoReplyKind: null }), true],
  ['AUTO', shop({ autoReplyKind: 'AUTO' }), true],
  ['AUTO_TEST', shop({ autoReplyKind: 'AUTO_TEST' }), true],
  ['AUTO_NOTICE', shop({ autoReplyKind: 'AUTO_NOTICE' }), true],
  ['AUTO_FOLLOW (ฟองบอทเอง)', shop({ autoReplyKind: AUTO_FOLLOW_KIND }), false],
  ['deliveryStatus=FAILED', shop({ deliveryStatus: 'FAILED' }), false],
  ['deliveryStatus=QUEUED', shop({ deliveryStatus: 'QUEUED' }), true],
  ['deliveryStatus=SENT', shop({ deliveryStatus: 'SENT' }), true],
  ['deliveryStatus=null (แชทในแอป)', shop({ deliveryStatus: null }), true],
  ['type การ์ด 00061', shop({ type: AUTO_ORDER_RESULT_TYPE }), false],
  ['type FOLLOW_BOT_NOTE', shop({ type: FOLLOW_BOT_NOTE_TYPE }), false],
  ['type META_NOTICE', shop({ type: META_NOTICE_TYPE }), false],
  ['ถูกลบ', shop({ isDeleted: true }), false],
  ['BUYER', shop({ senderRole: 'BUYER' }), false],
  ['ขอบ 30 วัน เก่าเกิน', shop({ createdAt: iso(-30 * DAY_MS - 1000) }), false],
]

describe('TC-030/031/032 RealBuyerMsg · CountedShopReply — parity Prisma where ↔ SQL', () => {
  it.each(BUYER)('RealBuyerMsg: %s', (_n, r, want) => {
    expect(evalWhere(realBuyerMsgWhere(NOW) as never, r) === true, 'Prisma where').toBe(want)
    expect(evalSql(realBuyerMsgSql('m', SINCE), r) === true, 'SQL').toBe(want)
  })
  it.each(SHOP_REPLY)('CountedShopReply: %s', (_n, r, want) => {
    expect(evalWhere(countedShopReplyWhere(NOW) as never, r) === true, 'Prisma where').toBe(want)
    expect(evalSql(countedShopReplySql('m', SINCE), r) === true, 'SQL').toBe(want)
  })

  it('ตัวประเมินจับ NULL จริง: NOT startsWith เดี่ยว ๆ ทิ้งแถว NULL (กันเทสหลอก)', () => {
    expect(evalWhere({ NOT: { externalMessageId: { startsWith: 'pb:' } } }, row({ externalMessageId: null }))).toBeNull()
    expect(evalWhere({ autoReplyKind: { not: 'X' } }, row({ autoReplyKind: null }))).toBeNull()
  })

  it('TC-037 INTERNAL_MESSAGE_TYPES มีครบ 3 ชนิด และ SQL ใช้ชุดเดียวกัน', () => {
    expect(INTERNAL_MESSAGE_TYPES).toEqual(expect.arrayContaining([AUTO_ORDER_RESULT_TYPE, META_NOTICE_TYPE, FOLLOW_BOT_NOTE_TYPE]))
    for (const t of INTERNAL_MESSAGE_TYPES) {
      expect(realBuyerMsgSql('m', SINCE)).toContain(`'${t}'`)
      expect(countedShopReplySql('m', SINCE)).toContain(`'${t}'`)
    }
  })

  it('TC-033 ขอบ 30 วันอยู่ในทั้งสองรูป (บังคับรับ now/sinceExpr)', () => {
    expect(JSON.stringify(realBuyerMsgWhere(NOW))).toContain(messageLookbackSince(NOW).toISOString())
    expect(JSON.stringify(countedShopReplyWhere(NOW))).toContain(messageLookbackSince(NOW).toISOString())
    expect(realBuyerMsgSql('m', SINCE)).toContain(`"createdAt" >= ${SINCE}`)
    expect(countedShopReplySql('m', SINCE)).toContain(`"createdAt" >= ${SINCE}`)
  })
})

describe('TC-034/035 ตำแหน่งข้อความ · ร้านค้างตอบ · ลูกค้าตอบหลังฟองบอท', () => {
  const p = (ms: number, seq: number) => ({ createdAt: new Date(NOW.getTime() + ms), seq })
  it('เวลาเท่ากันตัดสินที่ seq', () => {
    expect(compareMsgPos(p(0, 2), p(0, 1))).toBeGreaterThan(0)
    expect(isAwaitingShop(p(0, 2), p(0, 1))).toBe(true)
    expect(isAwaitingShop(p(0, 1), p(0, 2))).toBe(false)
  })
  it('ไม่มีข้อความลูกค้า = ไม่ค้างตอบ · ไม่มีร้านตอบ = ค้างตอบ', () => {
    expect(isAwaitingShop(null, p(0, 1))).toBe(false)
    expect(isAwaitingShop(null, null)).toBe(false)
    expect(isAwaitingShop(p(0, 1), null)).toBe(true)
  })
  it('ลูกค้าตอบหลังฟอง = true · ก่อน/ก่อนขั้นแรก = false (BR-FB-42)', () => {
    expect(customerRepliedAfterBot(p(10, 5), p(0, 4))).toBe(true)
    expect(customerRepliedAfterBot(p(0, 5), p(0, 4))).toBe(true)
    expect(customerRepliedAfterBot(p(-10, 3), p(0, 4))).toBe(false)
    expect(customerRepliedAfterBot(p(10, 5), null)).toBe(false)
    expect(customerRepliedAfterBot(null, p(0, 4))).toBe(false)
  })
})
