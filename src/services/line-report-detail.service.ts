/**
 * line-report-detail.service.ts — ประกอบ snapshot ของหน้า "สรุปรายละเอียด" สาธารณะ (00070 EXT-LINK FR-03/04/07)
 *
 * 🛑 HR16: ตัวเลขหัว/ต่อร้านอ่านจาก GroupSummary ที่ใช้สร้างการ์ดใบเดียวกัน — ไฟล์นี้ไม่คำนวณยอดใหม่
 *   query A/B มีไว้แบ่งก้อน + ทำรายการเท่านั้น แล้วเทียบกลับ summary (parity) ไม่เท่า = ติด MISMATCH ไม่ใช่เปลี่ยนหัว
 * 🛑 ห้ามใช้ countsAsServiceRevenue / serviceUnclosedOrderWhere: มันตัด RETURNED ผลรวมจะไม่เท่าการ์ด (F-6)
 */
import { prisma } from '@/lib/prisma'
import { shiftIsoDate, thaiMidnightUtc } from '@/lib/date-range'
import { withoutDrafted } from '@/lib/order-visibility'
import { round2 } from '@/lib/round2'
import { resolveShopVertical } from '@/lib/lodging'
import { resolveProductVocab } from '@/lib/seller-menu'
import { SYSTEM_RETURN_SHIPPING_LABEL_TH, SYSTEM_SHIPPING_LABEL_TH } from '@/lib/expense'
import { combineTotals } from '@/lib/line-report/aggregate'
import { deriveExposure, deriveFlags, type TemplateV1 } from '@/lib/line-report/template'
import { detailExpiresAt } from '@/lib/line-report/detail-expiry'
import {
  MAX_EXPENSE_ROWS_PER_SHOP,
  MAX_ROWS_PER_SHOP,
  fitToBudget,
  parseSnapshot,
  type Bucket,
  type DetailShop,
  type DetailSnapshotV1,
  type ExpenseRow,
} from '@/lib/line-report/detail-snapshot'
import { bucketLabels, classifyBucket, ruleOf, toExpenseRow, toOrderRow } from '@/lib/line-report/detail-snapshot-rows'
import { resolveOrderSource } from '@/lib/order-source-channel'
import { lineProductImageUrl } from '@/lib/line-report/product-image'
import { reportOrderWord, salesTotal } from '@/lib/line/flex-report-blocks'
import { loadPnl, type PnlLoad, type SweepCache } from '@/services/line-report-summary.service'
import type { GroupSummary, ReportKind, ShopSummary, Window } from '@/lib/line-report/types'

/**
 * ชุดใบของยอดบนการ์ด = getSalesSeries(shop,'daily',…, false) แบบไม่ส่ง vertical
 * (dashboard.service.ts:305-311: ไม่ใช่ CANCELLED/DRAFTED ตัดวันด้วย createdAt ไทย)
 * ไม่ extract ออกจาก dashboard.service (OOS-13) — เทส parity ฐานจริงเป็นด่านที่จับถ้าสองฝั่งเบี่ยง
 */
const thaiStart = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return thaiMidnightUtc(y, m - 1, d)
}
export const cardOrderSetWhere = (shopId: string, w: { startIso: string; endIso: string }) => ({
  shopId,
  ...withoutDrafted('CANCELLED'),
  createdAt: { gte: thaiStart(w.startIso), lt: thaiStart(shiftIsoDate(w.endIso, 1)) },
})

type CardOrder = {
  id: string
  createdAt: Date
  status: string
  totalAmount: unknown
  serviceClosedAt: Date | null
  shipments: { status: string; isDryRun: boolean; carrierStatus: string | null; direction: string }[]
}

/** query A: แคบ ทั้งชุด — ใหม่→เก่า (id เป็นตัวตัดเสมอให้ลำดับนิ่ง) */
const queryA = (shopId: string, w: Window): Promise<CardOrder[]> =>
  prisma.order.findMany({
    where: cardOrderSetWhere(shopId, w),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      createdAt: true,
      status: true,
      totalAmount: true,
      serviceClosedAt: true,
      shipments: { select: { status: true, isDryRun: true, carrierStatus: true, direction: true } },
    },
  })

const sumAmount = (os: CardOrder[]) => round2(os.reduce((a, o) => a + Number(o.totalAmount), 0))

/**
 * ค่าใช้จ่ายทุกรายการ ใหม่→เก่า + บรรทัดค่าส่งของระบบ (ย้ำ: ไม่แก้ expenseItems — นั่นไม่อ่านโน้ต)
 * Σ amount (ก่อนตัดเพดาน) = report.totalExpense = ShopFinance.expense
 * บรรทัดระบบอยู่หน้าสุด: ถูกตัดเพดานท้ายแถวแล้วเงินก้อนใหญ่ไม่หาย
 */
export function expenseDetailRows(
  expenses: readonly { expenseDate: Date; category: string; amount: unknown; note: string | null }[],
  report: { shippingCost: number; returnShippingCost: number },
  systemDate: Date,
): ExpenseRow[] {
  const sys = (category: string, amount: number) =>
    amount > 0 ? [toExpenseRow({ date: systemDate, category, amount, note: null, system: true })] : []
  const dated = [...expenses]
    .sort((a, b) => b.expenseDate.getTime() - a.expenseDate.getTime())
    .map((e) => toExpenseRow({ date: e.expenseDate, category: e.category, amount: Number(e.amount), note: e.note }))
  return [
    ...sys(SYSTEM_SHIPPING_LABEL_TH, report.shippingCost),
    ...sys(SYSTEM_RETURN_SHIPPING_LABEL_TH, report.returnShippingCost),
    ...dated,
  ]
}

const noRows = () => ({ rows: [], rowsTotal: 0, rowsTruncated: false })

async function shopDetail(
  s: ShopSummary,
  w: Window,
  exp: DetailSnapshotV1['exposure'],
  cache: SweepCache,
): Promise<DetailShop> {
  const rule = ruleOf(s.shop.vertical)
  const head = {
    name: s.shop.name,
    state: s.state,
    rule,
    orderWord: reportOrderWord([s]).word,
    itemColLabel: resolveProductVocab(resolveShopVertical(s.shop.vertical)).itemColLabel,
    ...(s.excludedReason ? { excludedReason: s.excludedReason } : {}),
  }
  // ERROR/EXCLUDED: เก็บสถานะ/เหตุผลอย่างเดียว ไม่มีตัวเลข (ศูนย์ที่นี่ไม่ใช่ "ไม่มียอด" — หน้าอ่านจาก state)
  if (s.state !== 'OK') return { ...head, orders: 0, ...noRows() }

  const out: DetailShop = { ...head, orders: s.orders, ...noRows() }
  if (exp.cancelled) out.cancelled = s.cancelled
  if (exp.sales) out.sales = s.confirmed + s.unconfirmed

  if (exp.orders || exp.sales) {
    // parity: Σ A เทียบ summary — race กับการแก้ออเดอร์ → ลอง 1 ครั้ง แล้วยังไม่เท่าก็ติดป้าย ไม่เปลี่ยนหัว
    const matches = (os: CardOrder[]) =>
      os.length === s.orders && sumAmount(os) === round2(s.confirmed + s.unconfirmed)
    let a = await queryA(s.shop.id, w)
    if (!matches(a)) a = await queryA(s.shop.id, w)
    if (!matches(a)) {
      console.error('[line-report] detail parity mismatch')
      out.parity = 'MISMATCH'
    }

    if (exp.sales) {
      const [l0, l1] = bucketLabels(rule)
      const keys = rule === 'SERVICE' ? (['CLOSED', 'UNCLOSED'] as const) : (['COUNTED', 'PENDING'] as const)
      const part = [0, 1].map((b) => a.filter((o) => classifyBucket(o, rule) === b))
      // ยอดจากชุดเต็ม A ไม่ใช่จากแถวที่ตัดเพดาน (partial-data-must-be-labeled)
      const mk = (i: 0 | 1, label: string): Bucket => ({
        key: keys[i],
        label,
        count: part[i].length,
        amount: sumAmount(part[i]),
      })
      out.buckets = [mk(0, l0), mk(1, l1)]
    }

    // query B: รายละเอียด ≤150 ใบล่าสุดของ A — ดึงเฉพาะ id ใน A และร้านเดียวกัน แถวจึงเป็นสับเซตของ A เสมอ
    const top = a.slice(0, MAX_ROWS_PER_SHOP)
    const detail = await prisma.order.findMany({
      where: { id: { in: top.map((o) => o.id) }, shopId: s.shop.id },
      select: {
        id: true,
        buyerName: true,
        buyerContact: true,
        room: { select: { name: true } },
        salesChannel: true,
        shopChannel: { select: { provider: true } }, // ห้ามเลือก avatarUrl: เป็น URL ภายนอก (Facebook) หน้านี้ห้ามโหลด
        items: { select: { name: true, qty: true, productId: true } },
      },
    })
    // รูปสินค้า: รูปแรกของ item แรกที่มี productId · query เดียวต่อร้าน จำกัด shopId (กันสินค้าร้านอื่นหลุด)
    const firstPid = (d: (typeof detail)[number]) => d.items.find((it) => it.productId)?.productId ?? null
    const pids = [...new Set(detail.flatMap((d) => firstPid(d) ?? []))]
    const prods = pids.length
      ? await prisma.product.findMany({ where: { id: { in: pids }, shopId: s.shop.id }, select: { id: true, images: true } })
      : []
    const firstImage = new Map(prods.map((p) => [p.id, Array.isArray(p.images) ? (p.images[0] as string | undefined) : undefined]))
    const byId = new Map(detail.map((d) => [d.id, d]))
    out.rows = top.flatMap((o) => {
      const d = byId.get(o.id)
      if (!d) return []
      const pid = firstPid(d)
      const img = lineProductImageUrl(pid ? firstImage.get(pid) : undefined)
      const channel = resolveOrderSource({
        salesChannel: d.salesChannel,
        shopChannel: d.shopChannel ? { avatarUrl: null, provider: d.shopChannel.provider } : null,
        legacyFacebookPageAvatar: null,
      }).channel
      const row = toOrderRow(
        { ...o, ...d, totalAmount: Number(o.totalAmount), imageUrl: img?.startsWith('https://') ? img : undefined, channel },
        rule,
      )
      if (exp.sales) return [row]
      const { amount: _a, bucket: _b, ...rest } = row // ปิดยอดขาย = ไม่มียอด/ก้อนใน payload เลย
      return [rest]
    })
    out.rowsTotal = a.length
    out.rowsTruncated = a.length > out.rows.length
  }

  if (exp.expense) {
    const pnl: PnlLoad = await loadPnl(s.shop, w.startIso, w.endIso, cache)
    // บรรทัดระบบเป็นยอดรวมของช่วง ไม่มีวันของตัวเอง — ใช้วันสิ้นสุดช่วง
    const all = expenseDetailRows(pnl.expenses, pnl, thaiStart(w.endIso))
    out.expense = {
      recorded: pnl.expenseRecorded,
      total: s.finance?.expense ?? pnl.expense,
      rows: all.slice(0, MAX_EXPENSE_ROWS_PER_SHOP),
      rowsTotal: all.length,
      rowsTruncated: all.length > MAX_EXPENSE_ROWS_PER_SHOP,
    }
  }
  return out
}

export async function buildDetailSnapshot(input: {
  summary: GroupSummary
  template: TemplateV1
  kind: Exclude<ReportKind, 'FINAL_NOTICE'>
  title: string
  window: Window
  now: Date
  cache: SweepCache
}): Promise<DetailSnapshotV1> {
  const { summary, template, kind, title, window: w, now, cache } = input
  const f = deriveFlags(template)
  const exposure = {
    orders: f.showOrders,
    sales: f.showSales,
    cancelled: f.showCancelled,
    expense: deriveExposure(template).expense,
  }
  const t = combineTotals(summary.shops) // ตัวเลขใหญ่เดียวกับการ์ด (flex-report-blocks)
  const ow = reportOrderWord(summary.shops)
  const shops = await Promise.all(summary.shops.map((s) => shopDetail(s, w, exposure, cache)))
  const snap: DetailSnapshotV1 = {
    v: 1,
    kind,
    window: {
      startIso: w.startIso,
      endIso: w.endIso,
      ...(w.fullDay !== undefined ? { fullDay: w.fullDay } : {}),
      computedAt: w.computedAt,
    },
    title,
    orderWord: ow.word,
    orderWordMixed: ow.mixed,
    mixedFinanceRules: summary.mixedFinanceRules,
    expiresAt: detailExpiresAt(now).toISOString(),
    exposure,
    total: {
      orders: t.orders,
      ...(exposure.sales ? { sales: salesTotal(t) } : {}),
      ...(exposure.cancelled ? { cancelled: t.cancelled } : {}),
    },
    shops,
  }
  const out = parseSnapshot(fitToBudget(snap))
  if (!out) throw new Error('DETAIL_SNAPSHOT_INVALID') // ผู้เรียกจับแล้วใช้ปุ่มเดิม (AC-LINK-01-3)
  return out
}
