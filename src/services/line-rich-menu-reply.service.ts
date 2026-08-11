import 'server-only'

/**
 * line-rich-menu-reply.service — ตอบสถานะพัสดุอัตโนมัติเมื่อลูกค้าแตะปุ่มบนเมนูลัด
 * (feature 00045 FR-RM-09 / มติ D-RM-3)
 *
 * 🛑 **กฎเหล็ก BR-LINE-18: ตอบได้เฉพาะด้วย reply token เท่านั้น ห้าม fallback ไป push เด็ดขาด**
 * ระบบอัตโนมัติที่ push คือการใช้เงินร้านโดยที่ร้านไม่ได้สั่ง. ด่านจริงอยู่ที่ `replyOnly` ของ
 * `sendOutboundMessage` (หลัง CAS) ไม่ใช่ที่การเช็คหน้าต่างในไฟล์นี้ — การเช็คที่นี่มีไว้ตัดงาน
 * ที่ไม่มีทางสำเร็จออกไปก่อน ไม่ใช่เป็นด่านสุดท้าย
 *
 * ตอบไม่ได้ = **เงียบ** ปล่อยให้บับเบิล "ลูกค้าแตะปุ่ม: …" ที่ ingest ไว้แล้วขึ้นในเธรดตามปกติ
 * เพื่อให้คนตอบต่อ — ดีกว่าเสียเงินร้านโดยไม่มีใครสั่ง
 */

import { prisma } from '@/lib/prisma'
import { getLineReplyWindowState } from '@/lib/line/reply-window'
import {
  buildOrderStatusText,
  pickOrderForStatusReply,
  NO_ORDER_REPLY_TEXT,
  type OrderStatusCandidate,
} from '@/lib/line/order-status-reply'
import { formatOrderNo } from '@/lib/order-no'
import { sendOutboundMessage } from './channel-chat.service'

export type OrderStatusReplyOutcome =
  | 'REPLIED'
  | 'REPLIED_NO_ORDER'
  /** หน้าต่างตอบฟรีปิด/ถูกใช้ไปแล้ว — จบเงียบ ไม่ส่งอะไรเลย (BR-LINE-18) */
  | 'NO_TOKEN'
  | 'NO_CONVERSATION'

export async function replyOrderStatus(params: {
  shopId: string
  shopChannelId: string
  externalUserId: string
}): Promise<OrderStatusReplyOutcome> {
  const conversation = await prisma.conversation.findFirst({
    where: {
      shopId: params.shopId,
      shopChannelId: params.shopChannelId,
      externalContact: { externalUserId: params.externalUserId },
    },
    select: {
      id: true,
      replyToken: true,
      replyTokenExpiresAt: true,
      replyTokenUsedAt: true,
      externalContact: { select: { customerId: true } },
    },
  })
  if (!conversation) return 'NO_CONVERSATION'

  // ตัดงานที่ไม่มีทางสำเร็จออกก่อน — ด่านจริงคือ `replyOnly` ในตัวส่ง (ดูหัวไฟล์)
  if (!getLineReplyWindowState(conversation, Date.now()).open) return 'NO_TOKEN'

  const customerId = conversation.externalContact?.customerId ?? null

  /**
   * ลูกค้า LINE ที่ยังไม่ถูกผูกกับ `Customer` (ผูกได้ต่อเมื่อรู้เบอร์) จะไม่มีทางหาออเดอร์เจอ
   * แม้เขาจะมีออเดอร์อยู่จริง — เคสนี้จะเจอบ่อยในช่วงแรก จึงต้องตอบข้อความที่บอกทางออก
   * ไม่ใช่ "ไม่พบข้อมูล" (FR-RM-09 AC)
   */
  let text = NO_ORDER_REPLY_TEXT
  if (customerId) {
    const rows = await prisma.order.findMany({
      where: { shopId: params.shopId, customerId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        orderNo: true,
        publicToken: true,
        createdAt: true,
        status: true,
        paymentMethod: true,
        codReceivedAt: true,
        shipments: {
          where: { status: 'CREATED', isDryRun: false },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { carrierStatus: true },
        },
      },
    })

    const candidates: OrderStatusCandidate[] = rows.map((o) => ({
      orderNo: o.orderNo ?? formatOrderNo(o.publicToken, o.createdAt),
      status: o.status,
      carrierStatus: o.shipments[0]?.carrierStatus ?? null,
      hasShipment: o.shipments.length > 0,
      paymentMethod: o.paymentMethod,
      codReceivedAt: o.codReceivedAt,
    }))

    const picked = pickOrderForStatusReply(candidates)
    if (picked) text = buildOrderStatusText(picked)
  }

  try {
    await sendOutboundMessage({
      conversationId: conversation.id,
      // เส้นทางระบบ — ไม่มี user จริงให้เช็คสิทธิ์ ต้องประกาศ shopId ที่เชื่อว่าเป็นเจ้าของออกมา
      actorUserId: null,
      systemShopId: params.shopId,
      autoReplyKind: 'AUTO',
      text,
      // 🛑 หัวใจของ D-RM-3 — claim reply token ไม่ได้เมื่อไหร่ให้ยกเลิก ห้ามตกไป push
      replyOnly: true,
    })
  } catch (e) {
    // REPLY_WINDOW_CLOSED = แพ้ CAS ให้ผู้ส่งอื่น หรือ token หมดอายุระหว่างทาง — จบเงียบตามกติกา
    if (e instanceof Error && e.message === 'REPLY_WINDOW_CLOSED') return 'NO_TOKEN'
    throw e
  }

  return text === NO_ORDER_REPLY_TEXT ? 'REPLIED_NO_ORDER' : 'REPLIED'
}
