/**
 * auto-notify-message.service — ประกอบ "ข้อความแจ้งลูกค้า" ของ 00078 (ตัวเดียวใช้ทั้งตัวส่งอัตโนมัติและปุ่มมือ — HR16)
 *
 * อ่านออเดอร์ + เทมเพลตของร้านจากฐาน → buildTemplateValues → renderTemplate → fitToChannelLimit
 * ไม่ส่งอะไรเอง: คืน "แผนการส่ง" (text + การ์ดถ้ามี) ให้ผู้เรียกส่งผ่านคิวขาออก/ sendMessage
 *
 * กติกา LINE/ช่องทาง (PRD · TD-006): เทมเพลต "ไม่ได้แก้" → การ์ดเดิม (ORDER_SUMMARY: LINE Flex / Meta ลิงก์ / DEEP การ์ด,
 * SERVICE_BOOKED: การ์ดนัด) · เทมเพลต "แก้แล้ว" → ข้อความล้วนทุกช่องทาง · ชนิดอื่น → ข้อความล้วนเสมอ
 */
import { prisma } from '@/lib/prisma'
import { ACTIVE_FORWARD_SHIPMENT } from '@/lib/shipment-direction'
import { DEFAULT_TEMPLATES } from '@/lib/auto-notify/defaults'
import { fitToChannelLimit, measureForChannel, CHANNEL_LIMIT, type FitChannel } from '@/lib/auto-notify/fit'
import { renderTemplate } from '@/lib/auto-notify/render'
import { buildTemplateValues, type AutoNotifySnapshot } from '@/lib/auto-notify/values'
import { normalizeTrackingKey } from '@/lib/auto-notify/ledger'
import type { AutoNotifyKind } from '@/lib/auto-notify/ledger-constants'
import { trackingLinkFor } from '@/lib/iship/tracking-link'
import { buildAppointmentSummary, type AppointmentSummary } from '@/lib/appointment-summary'
import { buildLineFlexOrderCard, type LineFlexOrderCardInput } from '@/lib/line/flex-order-card'
import { buildLineFlexAppointmentCard } from '@/lib/line/flex-appointment-card'
import { buildMetaAppointmentCard } from '@/lib/meta/appointment-card'
import { formatBaht } from '@/lib/format-money'
import { publicOrderUrl } from '@/lib/public-order-url'
import { resolveOrderVocab } from '@/lib/seller-menu'

/** บรรทัดคงที่ขึ้นต้นเมื่อแจ้งเลขใหม่ (BR-CS-C07) — อยู่นอกเทมเพลต ร้านลบไม่ได้ */
export const TRACKING_UPDATE_PREFIX = 'อัปเดตเลขติดตามพัสดุ'

export type ServiceNoticeKind = 'SERVICE_BOOKED' | 'SERVICE_STARTED' | 'SERVICE_CLOSED'

export interface NoticeContext {
  shopId: string
  orderId: string
  channel: FitChannel
  /** TRACKING: valueKey (normalize แล้ว) ที่ ledger จอง — ไม่ส่ง = ใช้เลขปัจจุบัน (ปุ่มมือ) */
  trackingKey?: string
  /** TRACKING: เคยแจ้งเลขอื่นของใบนี้มาก่อน → ขึ้นต้น TRACKING_UPDATE_PREFIX */
  isTrackingUpdate?: boolean
}

export type NoticeCard =
  | { kind: 'ORDER'; flexInput: LineFlexOrderCardInput }
  | { kind: 'APPOINTMENT'; summary: AppointmentSummary; url: string }

export type ComposedNotice =
  | { ok: true; text: string; isCustom: boolean; orderToken: string; card: NoticeCard | null }
  | { ok: false; reason: 'EMPTY_MESSAGE' | 'STALE_VALUE' | 'ORDER_NOT_FOUND' }

const SERVICE_KINDS: readonly AutoNotifyKind[] = ['SERVICE_BOOKED', 'SERVICE_STARTED', 'SERVICE_CLOSED']
export const isServiceNoticeKind = (k: AutoNotifyKind): k is ServiceNoticeKind => SERVICE_KINDS.includes(k)

async function loadOrder(shopId: string, orderId: string) {
  return prisma.order.findFirst({
    // ownership อยู่ใน WHERE — ใบของร้านอื่นคือ "ไม่มี"
    where: { id: orderId, shopId },
    select: {
      publicToken: true,
      orderNo: true,
      createdAt: true,
      totalAmount: true,
      buyerName: true,
      serviceStart: true,
      serviceEnd: true,
      depositAmount: true,
      serviceStartedAt: true,
      serviceClosedAt: true,
      items: { select: { name: true }, take: 1 },
      _count: { select: { items: true } },
      serviceResource: { select: { name: true } },
      shop: { select: { shopName: true, vertical: true } },
      shipmentTracking: { select: { provider: true, trackingNo: true } },
      shipments: {
        where: ACTIVE_FORWARD_SHIPMENT,
        orderBy: { createdAt: 'desc' },
        select: { trackingNo: true, courierName: true, courierCode: true, provider: true },
      },
    },
  })
}
type OrderRow = NonNullable<Awaited<ReturnType<typeof loadOrder>>>

async function resolveTemplate(shopId: string, kind: AutoNotifyKind) {
  const row = await prisma.autoNotifyTemplate.findUnique({ where: { shopId_kind: { shopId, kind } }, select: { body: true } })
  const def = DEFAULT_TEMPLATES[kind]
  // แถวที่ร้านบันทึกซ้ำค่าตั้งต้นเป๊ะ = ยังเป็นค่าตั้งต้น (การ์ดเดิมต้องไม่หายเพราะกดบันทึกเฉย ๆ)
  return { body: row?.body ?? def, isCustom: !!row && row.body !== def }
}

/** ตัดที่ขอบ code point เมื่อ fit แล้วยังเกิน (เหลือแต่ลิงก์ล้น) — SDS §8.5 */
function hardCut(text: string, channel: FitChannel): string {
  if (measureForChannel(text, channel) <= CHANNEL_LIMIT[channel].max) return text
  console.error('[auto-notify] ข้อความเกินเพดานช่องทางหลังย่อ — ตัดที่ขอบ code point', { channel })
  const chars = Array.from(text)
  while (chars.length > 0 && measureForChannel(chars.join(''), channel) > CHANNEL_LIMIT[channel].max) chars.pop()
  return chars.join('')
}

function snapshotOf(o: OrderRow, extra: Partial<AutoNotifySnapshot> = {}): AutoNotifySnapshot {
  return {
    vertical: o.shop.vertical,
    shopName: o.shop.shopName,
    buyerName: o.buyerName,
    orderNo: o.orderNo,
    publicToken: o.publicToken,
    createdAt: o.createdAt,
    totalAmount: o.totalAmount,
    firstItemName: o.items[0]?.name ?? null,
    itemCount: o._count.items,
    courierName: null,
    trackingNo: null,
    trackingLink: null,
    serviceName: o.items[0]?.name ?? null,
    appointmentStart: o.serviceStart,
    appointmentEnd: o.serviceEnd,
    depositAmount: o.depositAmount,
    serviceStartedAt: o.serviceStartedAt,
    serviceClosedAt: o.serviceClosedAt,
    ...extra,
  }
}

/** เลขพัสดุที่ใช้ได้ของใบนี้ — iShip active ก่อน แล้วค่อยเลขที่ร้านกรอก (ตรงกับที่ plan T14 ระบุ) */
type TrackingCandidate = { trackingNo: string; courierName: string | null; courierCode: string | null; source: 'ISHIP' | 'MANUAL' }
function trackingCandidates(o: OrderRow): TrackingCandidate[] {
  const list: TrackingCandidate[] = o.shipments
    .filter((s) => !!s.trackingNo?.trim())
    .map((s) => ({
      trackingNo: s.trackingNo!.trim(),
      courierName: s.courierName,
      courierCode: s.courierCode,
      // ลิงก์ติดตามของ iShip ใช้กับพัสดุ Flash ตรงไม่ได้ — ให้เป็น MANUAL จนกว่าจะมี URL ที่พิสูจน์แล้ว (00084 CS-29)
      source: s.provider === 'ISHIP' ? 'ISHIP' : 'MANUAL',
    }))
  const t = o.shipmentTracking
  if (t?.trackingNo?.trim()) {
    list.push({
      trackingNo: t.trackingNo.trim(),
      // provider ของแถวส่งเองคือชื่อขนส่งที่ร้านกรอก · ของ iShip คือคำว่า 'ISHIP' (ไม่ใช่ชื่อขนส่ง)
      courierName: t.provider === 'ISHIP' ? null : t.provider,
      courierCode: null,
      source: t.provider === 'ISHIP' ? 'ISHIP' : 'MANUAL',
    })
  }
  return list
}

export async function composeNotice(kind: AutoNotifyKind, ctx: NoticeContext): Promise<ComposedNotice> {
  if (isServiceNoticeKind(kind)) return composeServiceNotice(kind, ctx)
  const o = await loadOrder(ctx.shopId, ctx.orderId)
  if (!o) return { ok: false, reason: 'ORDER_NOT_FOUND' }
  const tpl = await resolveTemplate(ctx.shopId, kind)

  if (kind === 'TRACKING') {
    const cands = trackingCandidates(o)
    const picked = ctx.trackingKey ? cands.find((c) => normalizeTrackingKey(c.trackingNo) === ctx.trackingKey) : cands[0]
    // เลขเปลี่ยนไปแล้วหลังจอง (ledger ของเลขเก่า) → ไม่ส่งเลขใหม่แทนใบเก่า
    if (!picked) return { ok: false, reason: 'STALE_VALUE' }
    const values = buildTemplateValues(
      'TRACKING',
      snapshotOf(o, {
        courierName: picked.courierName,
        trackingNo: picked.trackingNo,
        trackingLink: trackingLinkFor({
          courierCode: picked.courierCode,
          courierName: picked.courierName,
          trackingNo: picked.trackingNo,
          source: picked.source,
        }),
      }),
    )
    const r = renderTemplate(tpl.body, values)
    if (!r.ok) return r
    const text = ctx.isTrackingUpdate ? `${TRACKING_UPDATE_PREFIX}\n${r.text}` : r.text
    return { ok: true, text: hardCut(fitToChannelLimit(text, ctx.channel), ctx.channel), isCustom: tpl.isCustom, orderToken: o.publicToken, card: null }
  }

  // ORDER_SUMMARY
  const r = renderTemplate(tpl.body, buildTemplateValues('ORDER_SUMMARY', snapshotOf(o)))
  if (!r.ok) return r
  const text = hardCut(fitToChannelLimit(r.text, ctx.channel), ctx.channel)
  if (tpl.isCustom) return { ok: true, text, isCustom: true, orderToken: o.publicToken, card: null }
  const vocab = resolveOrderVocab(o.shop.vertical)
  return {
    ok: true,
    text,
    isCustom: false,
    orderToken: o.publicToken,
    card: {
      kind: 'ORDER',
      flexInput: {
        title: o.items[0]?.name ?? vocab.noun,
        extraItemCount: Math.max(0, o._count.items - 1),
        totalText: formatBaht(Number(o.totalAmount)),
        url: publicOrderUrl(o.publicToken),
        noun: vocab.noun,
        buttonLabel: vocab.viewLabel,
      },
    },
  }
}

export async function composeServiceNotice(kind: ServiceNoticeKind, ctx: NoticeContext): Promise<ComposedNotice> {
  const o = await loadOrder(ctx.shopId, ctx.orderId)
  if (!o) return { ok: false, reason: 'ORDER_NOT_FOUND' }
  const tpl = await resolveTemplate(ctx.shopId, kind)
  const r = renderTemplate(tpl.body, buildTemplateValues(kind, snapshotOf(o)))
  if (!r.ok) return r
  const text = hardCut(fitToChannelLimit(r.text, ctx.channel), ctx.channel)
  if (kind !== 'SERVICE_BOOKED' || tpl.isCustom || !o.serviceStart) {
    return { ok: true, text, isCustom: tpl.isCustom, orderToken: o.publicToken, card: null }
  }
  const url = publicOrderUrl(o.publicToken)
  const deposit = Number(o.depositAmount ?? 0)
  const summary = buildAppointmentSummary(
    {
      serviceStart: o.serviceStart,
      serviceEnd: o.serviceEnd,
      serviceName: o.items[0]?.name ?? null,
      resourceName: o.serviceResource?.name ?? null,
      customerName: o.buyerName,
      phone: null, // เบอร์ลูกค้าไม่อยู่ในชุดตัวแปรเทมเพลต (PII) — การ์ดอัตโนมัติก็ไม่ใส่
      totalText: formatBaht(Number(o.totalAmount)),
      depositText: deposit > 0 ? formatBaht(deposit) : null,
    },
    { url },
  )
  return { ok: true, text, isCustom: false, orderToken: o.publicToken, card: { kind: 'APPOINTMENT', summary, url } }
}

/** ส่วนเสริมของ enqueueOutbound ตามช่องทางนอก (LINE Flex / Meta template) — การ์ดไม่มีหรือ http → ข้อความล้วน */
export function externalCardParts(card: NoticeCard | null, channel: FitChannel) {
  if (!card) return {}
  if (card.kind === 'ORDER') {
    return {
      flex: channel === 'LINE' && card.flexInput.url.startsWith('https://') ? buildLineFlexOrderCard(card.flexInput) : undefined,
    }
  }
  const https = card.url.startsWith('https://')
  return {
    isAppointmentCard: true,
    flex: channel === 'LINE' && https ? buildLineFlexAppointmentCard(card.summary, card.url) : undefined,
    template: channel !== 'LINE' && https ? buildMetaAppointmentCard(card.summary, card.url) : undefined,
  }
}
