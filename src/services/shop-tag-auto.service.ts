import 'server-only'
import { prisma } from '@/lib/prisma'
import { matchTagKeywords, tagNameKey, variantsIn } from '@/lib/shop-tag-match'

/**
 * 00083 — ติด/ถอด tag อัตโนมัติ (SRS TFR-007, TFR-009)
 * 🛑 ห้ามเขียนอาร์เรย์ tags ทั้งก้อน — ติดด้วย updateMany(NOT has, push) ที่อะตอมมิก, ถอดด้วย SQL array remove
 */

export type ApplyOutcome =
  | { outcome: 'APPLIED'; added: string[]; alreadyHad: string[] }
  | { outcome: 'SKIPPED'; reason: string }

export type RemoveOutcome =
  | { outcome: 'REMOVED'; removed: string[] }
  | { outcome: 'SKIPPED'; reason: string }
  | { outcome: 'ERROR' }

const skip = (reason: string) => ({ outcome: 'SKIPPED' as const, reason })

export async function applyKeywordTags(chatMessageId: string): Promise<ApplyOutcome> {
  const msg = await prisma.chatMessage.findUnique({
    where: { id: chatMessageId },
    select: {
      id: true, senderRole: true, type: true, body: true, autoReplyKind: true,
      conversationId: true,
      conversation: { select: { shopId: true, externalContactId: true } },
    },
  })
  if (!msg) return skip('MESSAGE_NOT_FOUND')
  if (msg.senderRole !== 'SHOP') return skip('NOT_SHOP')
  if (msg.type !== 'TEXT') return skip('NOT_TEXT')
  if (msg.autoReplyKind != null) return skip('BOT_MESSAGE')
  if (!msg.body?.trim()) return skip('EMPTY_BODY')
  const { shopId, externalContactId } = msg.conversation
  if (!externalContactId) return skip('NO_CONTACT')

  const rules = await prisma.shopTag.findMany({
    where: { shopId, NOT: { keywords: { isEmpty: true } } },
    select: { name: true, keywords: true },
  })
  if (rules.length === 0) return skip('NO_RULES')

  const matches = matchTagKeywords(msg.body, rules)
  if (matches.length === 0) return skip('NO_MATCH')

  // ข้อความนี้กลายเป็นคำสั่งซื้อจริงแล้ว = ไม่ใช่การคุยเปิดงาน (ร่าง/โหมดทดสอบไม่นับ)
  const order = await prisma.order.findFirst({
    where: { sourceChatMessageId: msg.id, status: { not: 'DRAFTED' }, isDryRun: false },
    select: { id: true },
  })
  if (order) return skip('ORDER_ALREADY_CREATED')

  const contact = await prisma.externalContact.findUnique({
    where: { id: externalContactId },
    select: { tags: true },
  })
  if (!contact) return skip('NO_CONTACT')

  const alreadyHad: string[] = []
  const toAdd = matches.filter((m) => {
    if (variantsIn(contact.tags, tagNameKey(m.name)).length > 0) {
      alreadyHad.push(m.name)
      return false
    }
    return true
  })

  const added: string[] = []
  if (toAdd.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const m of toAdd) {
        // count=1 = เราเป็นคนติดจริง (ถ้าอีกคำขอชิงติดก่อน count=0 → ไม่เขียน event)
        const r = await tx.externalContact.updateMany({
          where: { id: externalContactId, NOT: { tags: { has: m.name } } },
          data: { tags: { push: m.name } },
        })
        if (r.count !== 1) {
          alreadyHad.push(m.name)
          continue
        }
        await tx.shopTagEvent.create({
          data: {
            shopId, externalContactId, conversationId: msg.conversationId, tagName: m.name,
            action: 'ADD', source: 'KEYWORD', chatMessageId: msg.id, matchedKeyword: m.keyword.slice(0, 50),
          },
        })
        added.push(m.name)
      }
    })
  }
  return { outcome: 'APPLIED', added, alreadyHad }
}

export async function removeTagsOnOrderCreated(order: {
  id: string; shopId: string; conversationId: string | null; isDryRun: boolean
}): Promise<RemoveOutcome> {
  try {
    if (order.isDryRun) return skip('DRY_RUN')
    if (!order.conversationId) return skip('NO_CONVERSATION')
    const rules = await prisma.shopTag.findMany({
      where: { shopId: order.shopId, removeOnOrderCreate: true },
      select: { name: true },
    })
    if (rules.length === 0) return skip('NO_RULES')
    const conv = await prisma.conversation.findFirst({
      where: { id: order.conversationId, shopId: order.shopId },
      select: { id: true, externalContactId: true },
    })
    if (!conv?.externalContactId) return skip('NO_CONTACT')
    const contactId = conv.externalContactId
    const contact = await prisma.externalContact.findUnique({ where: { id: contactId }, select: { tags: true } })
    if (!contact) return skip('NO_CONTACT')

    const removed: string[] = []
    for (const rule of rules) {
      const variants = variantsIn(contact.tags, tagNameKey(rule.name))
      if (variants.length === 0) continue
      await prisma.$transaction(async (tx) => {
        const n = await tx.$executeRaw`
          UPDATE "ExternalContact"
          SET "tags" = ARRAY(SELECT t FROM unnest("tags") WITH ORDINALITY u(t, ord) WHERE t <> ALL(${variants}::text[]) ORDER BY ord)
          WHERE "id" = ${contactId} AND "tags" && ${variants}::text[]`
        if (n > 0) {
          await tx.shopTagEvent.create({
            data: {
              shopId: order.shopId, externalContactId: contactId, conversationId: conv.id, tagName: rule.name,
              action: 'REMOVE', source: 'ORDER_CREATED', orderId: order.id,
            },
          })
          removed.push(rule.name)
        }
      })
    }
    return { outcome: 'REMOVED', removed }
  } catch (e) {
    // ถอดล้ม ≠ สร้างออเดอร์ล้ม — กลืนไว้ที่นี่ (TD-003)
    console.error('[shop-tag-auto] removeTagsOnOrderCreated failed', e)
    return { outcome: 'ERROR' }
  }
}
