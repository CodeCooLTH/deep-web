/**
 * หน้าสรุปรายละเอียดสาธารณะ /lr/[token] (00070 EXT · S-8/S-9)
 * mutation ที่ต้องแดง: เอา escape ออก (dangerouslySetInnerHTML) · ให้ EXPIRED แสดง snapshot · ลบ safeImageUrl ·
 * เปลี่ยน CLOSED เป็น COUNTED ในแถบ · ใส่ fetch( ในหน้า
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }) }))
vi.mock('next/server', () => ({ connection: vi.fn(async () => {}) }))
const svc = vi.hoisted(() => ({ getSnapshotView: vi.fn() }))
vi.mock('@/services/line-report-snapshot.service', () => ({ getSnapshotView: svc.getSnapshotView }))

import { notFound } from 'next/navigation'
import { parseSnapshot, type DetailSnapshotV1, type OrderRow } from '@/lib/line-report/detail-snapshot'
import Page from '../page'

const SIGNED = 'https://seller.example.test/api/line-report/product-image?k=a%2Fb.png&s=sig'

type RowIn = Omit<OrderRow, 'at' | 'axis'> & { t: string; axis: OrderRow['axis'] }
const row = (r: RowIn): OrderRow => {
  const { t, ...rest } = r
  return { ...rest, at: `2026-10-14T${t}:00.000Z` } // t เป็นเวลา UTC (ไทย = +7)
}

const SERVICE_ROWS: OrderRow[] = [
  row({ t: '13:31', customerName: 'คุณปรีชา วงศ์ทอง', phoneMasked: '•••-•••-318', title: 'ติดตั้งกล้องหน้ารถ', amount: 11000, axis: 'PENDING', bucket: 1, channel: 'LINE' }),
  row({ t: '12:36', customerName: 'คุณนภัส รุ่งเรือง', phoneMasked: '•••-•••-772', title: 'เปลี่ยนยางหน้า-หลัง', amount: 7400, axis: 'CONFIRMED', bucket: 1 }),
  row({ t: '11:55', customerName: 'คุณสุดา แก้วใส', phoneMasked: '•••-•••-536', title: 'ตั้งศูนย์ล้อ และอีก 1 รายการ', amount: 7900, axis: 'CONFIRMED', bucket: 0 }),
  row({ t: '10:30', customerName: 'คุณธนากร ศรีสุข', phoneMasked: '•••-•••-204', title: 'เปลี่ยนโช้คหลัง', amount: 15000, axis: 'CONFIRMED', bucket: 0 }),
  row({ t: '04:23', customerName: null, phoneMasked: null, title: 'ติดตั้งไฟหน้า', amount: 7900, axis: 'PENDING', bucket: 1 }),
]

const emptyShop = { rowsTotal: 0, rowsTruncated: false, rows: [] as OrderRow[] }

const serviceShop = (rows = SERVICE_ROWS) => ({
  name: 'BT Premium สุขสวัสดิ์', state: 'OK' as const, rule: 'SERVICE' as const, orderWord: 'บริการ', itemColLabel: 'บริการ',
  orders: 5, sales: 49200, cancelled: 0,
  buckets: [
    { key: 'CLOSED' as const, label: 'ปิดงานแล้ว', count: 2, amount: 22900 },
    { key: 'UNCLOSED' as const, label: 'รอปิดงาน', count: 3, amount: 26300 },
  ] as [never, never],
  rows, rowsTotal: rows.length, rowsTruncated: false,
  expense: {
    recorded: true, total: 6394, rowsTotal: 4, rowsTruncated: false,
    rows: [
      { date: '2026-10-14T05:00:00.000Z', category: 'ค่าจ้างพนักงาน', amount: 3500, note: null },
      { date: '2026-10-14T05:00:00.000Z', category: 'อื่นๆ', amount: 2000, note: 'ค่าน้ำมัน' },
      { date: '2026-10-14T05:00:00.000Z', category: 'อื่นๆ', amount: 500, note: null },
      { date: '2026-10-14T16:59:00.000Z', category: 'ค่าส่ง (จ่ายขนส่ง)', amount: 394, note: null, system: true as const },
    ],
  },
})

const base = {
  v: 1 as const, kind: 'DAILY' as const,
  window: { startIso: '2026-10-14', endIso: '2026-10-14', fullDay: true, computedAt: '2026-10-14T14:01:00.000Z' },
  title: 'รายงานยอดรายวัน', orderWord: 'บริการ', orderWordMixed: false, mixedFinanceRules: false,
  expiresAt: '2026-10-15T17:00:00.000Z',
  exposure: { orders: true, sales: true, cancelled: true, expense: true },
}

function snap(over: Record<string, unknown> = {}): DetailSnapshotV1 {
  const parsed = parseSnapshot({ ...base, total: { orders: 5, sales: 49200, cancelled: 0 }, shops: [serviceShop()], ...over })
  if (!parsed) throw new Error('fixture ไม่ผ่าน DetailSnapshotSchema') // fixture ต้องตรงสัญญาจริง
  return parsed
}

const render = async (token = 'tok') => renderToStaticMarkup(await Page({ params: Promise.resolve({ token }) }))
const ok = (snapshot: DetailSnapshotV1) => svc.getSnapshotView.mockResolvedValue({ kind: 'OK', snapshot })

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SELLER_URL = 'https://seller.example.test'
})

describe('/lr/[token]', () => {
  it('ร้านบริการ: ตัวเลขตรง fixture + ป้ายก้อน + สเตมป์ + วันหมดอายุแบบสิ้นวัน', async () => {
    ok(snap())
    const html = await render()
    for (const t of ['49,200', '22,900', '26,300', '6,394', 'ปิดงานแล้ว', 'รอปิดงาน', 'รอยืนยัน', 'ยืนยันแล้ว', 'ลูกค้าไม่ระบุชื่อ', 'ค่าน้ำมัน', 'ค่าส่ง (จ่ายขนส่ง)', 'ระบบคิดให้']) {
      expect(html).toContain(t)
    }
    expect(html).toContain('ข้อมูล ณ 21:01 น.')
    expect(html).toContain('สิ้นวันที่ 15 ต.ค. 2569') // expiresAt = 00:00 วันที่ 16 (exclusive)
    expect(html).toContain('•••-•••-318')
    expect(html).not.toContain('฿')
  })

  it('ร้านบริการ: แท่งใช้สีเขียว(ปิดงาน)+เหลือง(รอปิดงาน) ไม่ใช่น้ำเงิน', async () => {
    ok(snap())
    const html = await render()
    const bar = html.match(/<div class="bg-default-200 flex h-2[\s\S]*?<\/div><\/div>/)?.[0] ?? ''
    expect(bar).toContain('bg-success')
    expect(bar).toContain('bg-warning')
    expect(bar).not.toContain('bg-primary')
  })

  it('ร้านทั่วไป: ยืนยันแล้ว = น้ำเงิน (ตามการ์ด)', async () => {
    const shop = {
      name: 'ร้านอะไหล่', state: 'OK', rule: 'GENERAL', orderWord: 'คำสั่งซื้อ', itemColLabel: 'สินค้า', orders: 2, sales: 12800, cancelled: 0,
      buckets: [{ key: 'COUNTED', label: 'x', count: 1, amount: 9500 }, { key: 'PENDING', label: 'y', count: 1, amount: 3300 }],
      rows: [
        row({ t: '04:00', customerName: 'ก', phoneMasked: null, title: 'ผ้าเบรก', amount: 9500, axis: 'CONFIRMED', bucket: 0 }),
        row({ t: '03:00', customerName: 'ข', phoneMasked: null, title: 'หลอดไฟ', amount: 3300, axis: 'PENDING', bucket: 1 }),
      ],
      rowsTotal: 2, rowsTruncated: false,
    }
    ok(snap({ shops: [shop], total: { orders: 2, sales: 12800, cancelled: 0 }, orderWord: 'คำสั่งซื้อ' }))
    const html = await render()
    expect(html).toContain('bg-primary/15 text-primary-ink')
    expect(html).toContain('>ยืนยันแล้ว<')
    expect(html).toContain('>รอยืนยัน<')
    expect(html).not.toContain('ปิดงานแล้ว')
  })

  it('หลายร้าน: หัวกลุ่ม 62,000 + <details> ต่อร้าน + ร้านที่ถูกล็อก', async () => {
    const shop2 = {
      name: 'ร้านอะไหล่ BT ออนไลน์', state: 'OK', rule: 'GENERAL', orderWord: 'คำสั่งซื้อ', itemColLabel: 'สินค้า', orders: 3, sales: 12800, cancelled: 1,
      buckets: [{ key: 'COUNTED', label: 'x', count: 2, amount: 9500 }, { key: 'PENDING', label: 'y', count: 1, amount: 3300 }],
      rows: [row({ t: '09:10', customerName: 'คุณมาลี', phoneMasked: null, title: 'ผ้าเบรกหน้า', amount: 12800, axis: 'CONFIRMED', bucket: 0 })],
      rowsTotal: 1, rowsTruncated: false,
    }
    const locked = { name: 'BT สาขาบางนา', state: 'EXCLUDED', rule: 'GENERAL', orderWord: 'รายการ', itemColLabel: 'สินค้า', excludedReason: 'LOCKED', orders: 0, ...emptyShop }
    ok(snap({ shops: [serviceShop(), shop2, locked], total: { orders: 8, sales: 62000, cancelled: 1 }, orderWord: 'รายการ', orderWordMixed: true, mixedFinanceRules: true }))
    const html = await render()
    expect(html).toContain('รวม 2 ร้าน')
    expect(html).toContain('62,000')
    expect(html).toContain('รายการ 8')
    expect(html).toContain('ยอดแต่ละร้านคิดตามกติกาของประเภทธุรกิจ')
    expect(html.match(/<details/g)).toHaveLength(2)
    expect(html).toContain('ไม่รวมร้าน BT สาขาบางนา (ถูกล็อก)')
  })

  it('ไม่เปิดค่าใช้จ่าย/ยอดขาย: ไม่มีการ์ดค่าใช้จ่าย ไม่มีคอลัมน์ยอด', async () => {
    const { expense: _e, buckets: _b, sales: _s, ...rest } = serviceShop()
    const rows = SERVICE_ROWS.map(({ amount: _a, bucket: _bk, ...r }) => r)
    ok(snap({ exposure: { orders: true, sales: false, cancelled: true, expense: false }, total: { orders: 5, cancelled: 0 }, shops: [{ ...rest, rows }] }))
    const html = await render()
    expect(html).not.toContain('ค่าใช้จ่าย')
    expect(html).not.toContain('49,200')
    expect(html).not.toContain('>ยอด<')
  })

  it('EXPIRED: หน้าแจ้งหมดอายุ ไม่มีตัวเลข/ชื่อลูกค้า · คำสั่งตาม reportKind', async () => {
    svc.getSnapshotView.mockResolvedValue({ kind: 'EXPIRED', expiresAt: new Date('2026-10-15T17:00:00.000Z'), reportKind: 'DAILY' })
    const html = await render()
    expect(html).toContain('ลิงก์สรุปนี้หมดอายุแล้ว')
    expect(html).toContain('สิ้นวันที่ 15 ต.ค. 2569')
    expect(html).toContain('“สรุปวันนี้”')
    for (const t of ['49,200', 'ปรีชา', 'BT Premium', '•••']) expect(html).not.toContain(t)
    svc.getSnapshotView.mockResolvedValue({ kind: 'EXPIRED', expiresAt: new Date('2026-10-15T17:00:00.000Z'), reportKind: 'MONTHLY' })
    expect(await render()).toContain('“สรุปเดือนนี้”')
  })

  it('NOT_FOUND เรียก notFound()', async () => {
    svc.getSnapshotView.mockResolvedValue({ kind: 'NOT_FOUND' })
    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalledTimes(1)
  })

  it('ชื่อ/ชื่องาน/ชื่อร้านที่มี <script> ถูก escape', async () => {
    const evil = '<script>alert(1)</script>'
    const rows = [row({ t: '10:00', customerName: evil, phoneMasked: null, title: evil, amount: 100, axis: 'CONFIRMED', bucket: 0 })]
    ok(snap({ shops: [{ ...serviceShop(rows), name: evil }] }))
    const html = await render()
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script&gt;')
  })

  it('รูปสินค้า: โหลดเฉพาะ route first-party ที่เซ็นแล้ว · URL ภายนอกถูกทิ้ง · ทุก src ไม่ชี้ออกนอก', async () => {
    const rows = [
      row({ t: '10:00', customerName: 'ก', phoneMasked: null, title: 'a', amount: 1, axis: 'CONFIRMED', bucket: 0, imageUrl: SIGNED, channel: 'FACEBOOK' }),
      row({ t: '09:00', customerName: 'ข', phoneMasked: null, title: 'b', amount: 1, axis: 'CONFIRMED', bucket: 0, imageUrl: 'https://evil.example/pixel.png' }),
    ]
    ok(snap({ shops: [serviceShop(rows)] }))
    const html = await render()
    expect(html).not.toContain('evil.example')
    const srcs = [...html.matchAll(/ src="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))
    expect(srcs).toContain(SIGNED)
    expect(srcs).toContain('/images/logos/facebook.svg') // โลโก้แพลตฟอร์ม self-host
    for (const s of srcs) expect(s.startsWith('/') || s.startsWith('https://seller.example.test/')).toBe(true)
  })
})

describe('ซอร์สของหน้า', () => {
  const root = path.resolve(__dirname, '../../../..')
  const files: string[] = []
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = path.join(d, f)
      if (statSync(p).isDirectory()) { if (f !== '__tests__') walk(p) } else if (/\.(tsx?|css)$/.test(f)) files.push(p)
    }
  }
  walk(root)

  it('ไม่มี fetch( / dangerouslySetInnerHTML / react-toastify / emoji / hex / text-[..]', () => {
    expect(files.length).toBeGreaterThan(6)
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(/fetch\(|dangerouslySetInnerHTML|react-toastify|Analytics|SpeedInsights/)
      expect(src, f).not.toMatch(/\p{Extended_Pictographic}/u)
      expect(src, f).not.toMatch(/#[0-9a-fA-F]{6}\b|\btext-\[|\bshadow-\[/)
    }
  })

  it('ไม่ import อะไรที่อ่าน session/cookies', () => {
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/next-auth|next\/headers|getServerSession|useSession/)
  })
})

describe('security L-1: safeImageUrl ต้องเป็น origin ของเรา', () => {
  it('ภายนอกที่ path เหมือนกันไม่ผ่าน · ของเราผ่าน', async () => {
    process.env.NEXT_PUBLIC_SELLER_URL = 'https://seller.example.test'
    const { safeImageUrl } = await import('../components/view-model')
    expect(safeImageUrl('https://evil.example/api/line-report/product-image?k=a&s=b')).toBeUndefined()
    expect(safeImageUrl('https://seller.example.test/api/line-report/product-image?k=a&s=b')).toBe('https://seller.example.test/api/line-report/product-image?k=a&s=b')
  })
})
