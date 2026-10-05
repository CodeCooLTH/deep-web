/**
 * block-meta — ชื่อ/ไอคอน/บรรทัดสรุปของบล็อกในหน้าจัดข้อความ (feature 00070 EXT · spec §3.3/§3.4) · pure
 *
 * บรรทัดสรุปเป็นค่าสถิติต่อชนิด — ห้ามคำนวณตัวเลขที่นี่ (HR16: ตัวเลขมาจาก SSOT ที่ composer เท่านั้น)
 * {คำ} ผันด้วย `orderWordFor` ที่ผู้เรียกส่งเข้ามา ไม่ฮาร์ดโค้ด "ออเดอร์"
 */
import { blockWarning, contextAvailability, type AvailabilityContext } from '@/lib/line-report/availability'
import type { Block, BlockType } from '@/lib/line-report/template'

export const BLOCK_ICON: Record<BlockType, string> = {
  orders: 'list-numbers',
  sales: 'cash',
  cancelled: 'ban',
  shops: 'building-store',
  cycle: 'history',
  profit: 'coin',
  text: 'message-2',
  separator: 'minus',
  chart_trend: 'chart-line',
  chart_compare: 'chart-bar',
}

export const blockTitle = (type: BlockType, word: string): string =>
  ({
    orders: `จำนวน${word}`,
    sales: 'ยอดขาย (นับแล้ว) และยังไม่นับ',
    cancelled: 'ยกเลิก',
    shops: 'รายร้าน',
    cycle: 'ยอดสะสมรอบนี้',
    profit: 'กำไร',
    text: 'ข้อความ',
    separator: 'เส้นคั่น',
    chart_trend: 'แนวโน้ม 7 วันล่าสุด',
    chart_compare: 'เทียบรายร้าน',
  })[type]

export const measureLabel = (m: 'sales' | 'orders', word: string): string => (m === 'sales' ? 'ยอดขาย (นับแล้ว)' : `จำนวน${word}`)

export const TEXT_SUMMARY_LEN = 40
export const TEXT_EMPTY_SUMMARY = 'ยังไม่ได้พิมพ์ข้อความ'

/** ข้อความสั้นใต้ชื่อบล็อกตอนแถวปิด */
export function blockSummary(b: Block, word: string, markup: string): string {
  switch (b.type) {
    case 'orders': return `จำนวน${word}รวมทุกร้าน`
    case 'sales': return 'ยอดนับแล้ว · ยังไม่นับ ติดกัน'
    case 'cancelled': return 'ใบที่เปิดในช่วงนี้แล้วถูกยกเลิก'
    case 'shops': return ['แยกรายร้าน', b.top3 ? 'ขายดี 3 อันดับ' : null, b.profit ? 'กำไรต่อร้าน' : null].filter(Boolean).join(' · ')
    case 'cycle': return 'ยอดนับแล้วสะสมตั้งแต่วันตัดรอบ'
    case 'profit': return 'กำไรรวมทุกร้าน'
    case 'separator': return 'เส้นคั่น'
    case 'chart_trend': return `7 วันล่าสุด · วัดจาก ${measureLabel(b.measure, word)}`
    case 'chart_compare': return `เรียงร้านมาก→น้อย · วัดจาก ${measureLabel(b.measure, word)}`
    case 'text': {
      const t = Array.from(markup)
      if (t.length === 0) return TEXT_EMPTY_SUMMARY
      return t.length > TEXT_SUMMARY_LEN ? `${t.slice(0, TEXT_SUMMARY_LEN).join('')}…` : markup
    }
  }
}

/** กลุ่มในคลัง — ลำดับตามสเปก §3.3 */
export const LIBRARY_GROUPS: readonly { title: string; types: readonly BlockType[] }[] = [
  { title: 'ข้อมูล', types: ['orders', 'sales', 'cancelled', 'shops', 'cycle', 'profit'] },
  { title: 'กราฟ', types: ['chart_trend', 'chart_compare'] },
  { title: 'ข้อความของคุณ', types: ['text', 'separator'] },
]

/** ชื่อที่ผู้ใช้เห็นบนปุ่ม ＋ ของข้อความ/เส้นคั่น (aria-label) */
export const ADD_LABEL = (type: BlockType, word: string): string =>
  type === 'text' ? 'เพิ่มข้อความ' : type === 'separator' ? 'เพิ่มเส้นคั่น' : `เพิ่ม${blockTitle(type, word)}`

/**
 * warning บนแถวผืนงาน — บล็อกที่มีอยู่แต่ "ไม่ถูกส่งตอนนี้" (ไม่ลบเงียบ · FR-11-4) · null = ปกติ
 * ข้อความอิสระที่ใช้ {ยอดสะสมรอบ} ตอนปิดรายเดือน: `blockWarning` ไม่ครอบข้อความ จึงตรวจจากโทเคนที่นี่
 */
export function rowWarning(b: Block, ctx: AvailabilityContext): string | null {
  const w = blockWarning(b, ctx)
  if (w) return w
  if (b.type === 'text' && b.runs.some((r) => 'tok' in r && r.tok === 'cycle_sales')) {
    const a = contextAvailability('cycle', ctx)
    if (!a.ok) return `ไม่ถูกส่งตอนนี้ (${a.reason})`
  }
  return null
}

/** บล็อกใหม่ตอนเพิ่มจากคลัง — ค่าตั้งต้นที่ปลอดภัย (ไม่เปิดกำไร/ขายดีเอง) · id มาจากผู้เรียก (reducer ต้อง pure) */
export function makeBlock(type: BlockType, id: string): Block {
  switch (type) {
    case 'shops': return { id, type, top3: false, profit: false }
    case 'chart_trend':
    case 'chart_compare': return { id, type, measure: 'sales' }
    case 'text': return { id, type, style: { bold: false, size: 'm', color: 'ink' }, runs: [] }
    default: return { id, type } as Block
  }
}
