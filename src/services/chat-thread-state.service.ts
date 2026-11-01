/**
 * สถานะห้องแชทสำหรับแชท Native ในแอปผู้ขาย (feature 00088 · user สั่ง 2026-11-01 "แก้ให้ครบ")
 *
 * หน้าเว็บ `seller/(chat)/inbox/[conversationId]/page.tsx` คำนวณค่าชุดนี้ที่ server แล้วส่งเป็น prop
 * ให้ ChatThread/CustomerPanel — ไม่มี API ไหนคืนค่าเหล่านี้ แอปจึงแสดงแถบสถานะ/ป้าย/สถิติไม่ได้
 *
 * 🛑 สูตรทุกตัวคัดจาก page.tsx บรรทัดต่อบรรทัด (อ้างเลขบรรทัดไว้ข้างแต่ละค่า) และเรียก helper ตัวเดียวกัน
 *    แก้สูตรในหน้าเว็บ ⇒ ต้องแก้ที่นี่ด้วย — ด่าน HR18 (`native-chat-sync/manifest.ts`) เฝ้า page.tsx ไว้แล้ว
 * 🛑 ห้ามคืน replyToken / externalUserId / เบอร์โทร — ได้แค่ผลที่คำนวณแล้ว (เหมือน prop ที่หน้าเว็บส่งลง client)
 * อ่านอย่างเดียว · ไม่แตะหน้าเว็บ · ผู้เรียกต้องผ่านด่าน H1 (resolveConversationShopId) มาก่อน
 */
import { after } from 'next/server'

import { prisma } from '@/lib/prisma'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { can, rolesFromMembership } from '@/lib/shop-permissions'
import { excludeDraftedWhere, withoutDrafted } from '@/lib/order-visibility'
import { getWindowState, syncInboundWindowFromMeta, canUseHumanAgent } from '@/services/channel-chat.service'
import { shouldAskMetaForInboundWindow } from '@/lib/inbound-window-sync'
import { getLineReplyWindowState } from '@/lib/line/reply-window'
import { getLineQuotaByChannelId } from '@/services/line-quota.service'
import { BOOKING_ORDER_TYPE } from '@/services/booking.service'
import { isShopVertical, DEFAULT_SHOP_VERTICAL } from '@/lib/lodging'
import { commentPermalink } from '@/lib/facebook-post'
import { resolvePostThumbnail } from '@/services/page-comment.service'
import { resolveSuggestProvider } from '@/lib/reply-suggest-provider'
import { resolveThreadOrderFilter } from '@/lib/chat-thread-orders'
import { usesServiceFinanceRules } from '@/lib/finance-rules'
import { getServiceCustomerSpend } from '@/services/customer-directory.service'
import { behaviorByShopCustomer, behaviorKey } from '@/services/customer-behavior.service'

export interface NativeThreadState {
  shopId: string
  // บอท (page.tsx:276-311, 842-847)
  botAutoReplyEnabled: boolean | null
  botPausedUntil: string | null
  botHandoffAt: string | null
  botHandoffReason: string | null
  isChatbotTestThread: boolean
  botCouldReply: boolean
  // ช่องทาง/หน้าต่างตอบ (page.tsx:392-400, 498-514, 867-892)
  windowOpen: boolean
  msRemaining: number
  humanAgentOpen: boolean
  humanAgentExpiresAt: string | null
  neverInbound: boolean
  tokenInvalid: boolean
  contactBlocked: boolean
  lineQuota: { type: string; level: string; remaining: number | null; total: number | null; stale: boolean } | null
  // คอมเมนต์/โฆษณา (page.tsx:454-497, 853-866, 791)
  isCommentReplyThread: boolean
  commentOrigin: {
    message: string | null
    attachmentUrl: string | null
    createdTime: string
    postMessage: string | null
    postThumbnailUrl: string | null
    postMediaType: string | null
    url: string | null
  } | null
  adReferral: { adId: string | null; adTitle: string | null; adBody: string | null; permalink: string | null; photoFileId: string | null } | null
  adReferralId: string | null
  // ลูกค้า (page.tsx:564-580, 661-708, 793)
  customerCounted: number | null
  customerStats: { orderCount: number; totalSpent?: string; since: string } | null
  threadOrderCount: number
  // AI แนะนำ (page.tsx:900)
  aiSuggestMode: 'auto' | 'manual'
}

/** null = ไม่พบเธรดในร้านนี้ (ผู้เรียกตอบ 404) */
export async function getNativeThreadState(conversationId: string, shopId: string, userId: string): Promise<NativeThreadState | null> {
  // select ชุดเดียวกับ page.tsx:149-215 เฉพาะคอลัมน์ที่ค่าข้างล่างใช้ · ownership อยู่ใน WHERE
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, shopId },
    select: {
      id: true,
      shopId: true,
      channel: true,
      lastInboundAt: true,
      autoReplyEnabled: true,
      autoReplyPausedUntil: true,
      handoffAt: true,
      handoffReason: true,
      referralSource: true,
      referralAdTitle: true,
      referralAdBody: true,
      referralAdPermalink: true,
      referralAdId: true,
      referralPhotoFileId: true,
      buyerUserId: true,
      externalContact: {
        select: {
          customer: { select: { id: true, createdAt: true } },
          isBlocked: true,
          externalUserId: true, // ใช้คำนวณ humanAgentOpen ที่นี่เท่านั้น ไม่คืนออกไป
        },
      },
      // 🛑 ห้าม select accessTokenEnc/channelSecretEnc
      shopChannel: { select: { id: true, status: true } },
      // ใช้คำนวณหน้าต่าง LINE เท่านั้น — 🛑 ห้ามคืน replyToken
      replyToken: true,
      replyTokenExpiresAt: true,
      replyTokenUsedAt: true,
    },
  })
  if (!conversation) return null
  const threadShopId = conversation.shopId

  const settle = <T,>(p: Promise<T>) => (p.catch(() => {}), p)
  const isLineThread = conversation.channel === 'LINE'
  const lineQuotaPromise = settle(
    isLineThread && conversation.shopChannel?.id ? getLineQuotaByChannelId(conversation.shopChannel.id) : Promise.resolve(null),
  )
  const deepCustomerPromise = settle(
    conversation.channel === 'DEEP' && conversation.buyerUserId
      ? prisma.customer.findUnique({ where: { userId: conversation.buyerUserId }, select: { id: true, createdAt: true } })
      : Promise.resolve(null),
  )
  const threadCtxPromise = settle(resolveActiveShopContext({ user: { id: userId, activeShopId: threadShopId } }))

  const [shopRow, chatbotCfg, testThread, liveKeywordCount, keywordTestThread, commentOriginLog] = await Promise.all([
    prisma.shop.findUnique({ where: { id: threadShopId }, select: { vertical: true } }),
    prisma.autoReplyConfig.findUnique({ where: { shopId: threadShopId }, select: { aiChatbotStatus: true } }),
    prisma.aiChatbotTestThread.findUnique({
      where: { shopId_conversationId: { shopId: threadShopId, conversationId } },
      select: { id: true },
    }),
    prisma.autoReplyKeyword.count({ where: { shopId: threadShopId, status: 'LIVE' } }),
    prisma.autoReplyKeywordTestThread.findFirst({
      where: { conversationId, keyword: { shopId: threadShopId, status: 'TEST' } },
      select: { id: true },
    }),
    prisma.commentReplyLog.findFirst({
      where: { conversationId: conversation.id },
      select: {
        id: true,
        comment: {
          select: {
            message: true,
            attachmentUrl: true,
            createdTime: true,
            externalCommentId: true,
            post: { select: { permalink: true, message: true, thumbnailUrl: true, mirroredFileId: true, mediaType: true } },
          },
        },
      },
    }),
  ])
  if (!shopRow) return null

  // page.tsx:295, 307-311
  const isChatbotTestThread = chatbotCfg?.aiChatbotStatus === 'TEST' && Boolean(testThread)
  const botCouldReply =
    chatbotCfg?.aiChatbotStatus === 'LIVE' || isChatbotTestThread || liveKeywordCount > 0 || Boolean(keywordTestThread)

  // page.tsx:369-385 — เปิดห้องจากแอปต้องได้ผลเดียวกับเปิดหน้าเว็บ (ยิงหลังตอบ ไม่ await)
  if (shouldAskMetaForInboundWindow({ channel: conversation.channel, lastInboundAt: conversation.lastInboundAt })) {
    after(syncInboundWindowFromMeta(conversation.id))
  }
  // page.tsx:392-400
  const windowState = isLineThread
    ? { ...getLineReplyWindowState(conversation, Date.now()), humanAgentOpen: false, humanAgentExpiresAt: null }
    : getWindowState(conversation.lastInboundAt)

  // page.tsx:485-497
  const commentOrigin = commentOriginLog?.comment
    ? {
        message: commentOriginLog.comment.message,
        attachmentUrl: commentOriginLog.comment.attachmentUrl,
        createdTime: commentOriginLog.comment.createdTime.toISOString(),
        postMessage: commentOriginLog.comment.post.message,
        postThumbnailUrl: resolvePostThumbnail(commentOriginLog.comment.post),
        postMediaType: commentOriginLog.comment.post.mediaType,
        url: commentPermalink(commentOriginLog.comment.post?.permalink, commentOriginLog.comment.externalCommentId),
      }
    : null

  // page.tsx:523
  const vertical = isShopVertical(shopRow.vertical) ? shopRow.vertical : DEFAULT_SHOP_VERTICAL

  // page.tsx:548-555
  const linkedCustomer: { id: string; createdAt: Date } | null =
    conversation.channel !== 'DEEP' ? conversation.externalContact?.customer ?? null : await deepCustomerPromise

  // page.tsx:564-580
  const threadOrderFilter = resolveThreadOrderFilter({ customerId: linkedCustomer?.id ?? null, conversationId: conversation.id })
  const threadOrderCountPromise = threadOrderFilter
    ? prisma.order.count({
        where: {
          shopId: threadShopId,
          ...threadOrderFilter,
          ...(vertical === 'LODGING' ? { type: BOOKING_ORDER_TYPE } : {}),
          ...excludeDraftedWhere,
        },
      })
    : Promise.resolve(0)

  // page.tsx:664-708
  const orderTypeFilter = vertical === 'LODGING' ? { type: BOOKING_ORDER_TYPE } : {}
  let customerStats: NativeThreadState['customerStats'] = null
  let customerCounted: number | null = null
  if (linkedCustomer) {
    const threadCtx = await threadCtxPromise
    const canSeeSpend = !!threadCtx && can(rolesFromMembership(threadCtx.role, threadCtx.roles), 'F1')
    const [orderCount, spentAgg, behaviorMap] = await Promise.all([
      prisma.order.count({
        where: { shopId: threadShopId, customerId: linkedCustomer.id, ...orderTypeFilter, ...excludeDraftedWhere },
      }),
      canSeeSpend && usesServiceFinanceRules(shopRow.vertical)
        ? getServiceCustomerSpend(threadShopId, linkedCustomer.id, orderTypeFilter).then((n) => n.toFixed(2))
        : canSeeSpend
          ? prisma.order
              .aggregate({
                where: { shopId: threadShopId, customerId: linkedCustomer.id, ...orderTypeFilter, ...withoutDrafted('CANCELLED') },
                _sum: { totalAmount: true },
              })
              .then((agg) => (agg._sum.totalAmount ? agg._sum.totalAmount.toFixed(2) : '0.00'))
          : Promise.resolve(null),
      behaviorByShopCustomer([threadShopId], [linkedCustomer.id]),
    ])
    customerCounted = behaviorMap.get(behaviorKey(threadShopId, linkedCustomer.id))?.counted ?? 0
    customerStats = {
      orderCount,
      ...(spentAgg != null ? { totalSpent: spentAgg } : {}),
      since: linkedCustomer.createdAt.toISOString(),
    }
  }

  const lineQuota = await lineQuotaPromise
  return {
    shopId: threadShopId,
    botAutoReplyEnabled: conversation.autoReplyEnabled,
    botPausedUntil: conversation.autoReplyPausedUntil?.toISOString() ?? null,
    botHandoffAt: conversation.handoffAt?.toISOString() ?? null,
    botHandoffReason: conversation.handoffReason,
    isChatbotTestThread,
    botCouldReply,
    windowOpen: windowState.open,
    msRemaining: windowState.msRemaining,
    // page.tsx:877-878
    humanAgentOpen: canUseHumanAgent(conversation.externalContact?.externalUserId ?? null) && windowState.humanAgentOpen,
    humanAgentExpiresAt: windowState.humanAgentExpiresAt?.toISOString() ?? null,
    neverInbound: conversation.lastInboundAt === null,
    // page.tsx:501-508
    tokenInvalid: conversation.channel !== 'DEEP' && (conversation.shopChannel?.status ?? 'ACTIVE') !== 'ACTIVE',
    contactBlocked: conversation.channel === 'LINE' && conversation.externalContact?.isBlocked === true,
    lineQuota: lineQuota
      ? { type: lineQuota.type, level: lineQuota.level, remaining: lineQuota.remaining, total: lineQuota.total, stale: lineQuota.stale }
      : null,
    isCommentReplyThread: commentOriginLog !== null,
    commentOrigin,
    // page.tsx:856-865
    adReferral:
      conversation.referralSource === 'ADS' &&
      (conversation.referralAdBody || conversation.referralAdTitle || conversation.referralAdId)
        ? {
            adId: conversation.referralAdId,
            adTitle: conversation.referralAdTitle,
            adBody: conversation.referralAdBody,
            permalink: conversation.referralAdPermalink,
            photoFileId: conversation.referralPhotoFileId,
          }
        : null,
    adReferralId: conversation.referralSource === 'ADS' ? conversation.referralAdId : null,
    customerCounted,
    customerStats,
    threadOrderCount: await threadOrderCountPromise,
    aiSuggestMode: resolveSuggestProvider(threadShopId) === 'typhoon' ? 'auto' : 'manual',
  }
}
