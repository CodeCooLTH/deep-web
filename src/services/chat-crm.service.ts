import { prisma } from '@/lib/prisma'

// CRM/tag ต่อผู้ติดต่อ (feature 00018) — alias เก็บที่ Conversation (ต่อแชท), ที่เหลือเก็บที่
// ExternalContact (ตามผู้ติดต่อ ข้ามแชทของ contact นั้น). DEEP thread ไม่มี ExternalContact →
// แก้ได้แค่ alias (CRM ฟิลด์อื่นเป็น read-only/ว่าง). ownership scope ด้วย shopId ทุก mutation.
// cross-channel merge (Messenger+IG+DEEP → โปรไฟล์เดียว) = Phase 2.

export type SalesStatus = 'UNSPECIFIED' | 'INTERESTED' | 'NOT_INTERESTED'

export type ConversationCrm = {
  alias: string | null
  // realName: ชื่อจริงจาก contact/buyer (view-only — ต่างจาก alias ที่ตั้งเองต่อแชท)
  realName: string | null
  // external = true → แก้ CRM ฟิลด์ได้ (มี ExternalContact); false (DEEP) → แก้ได้แค่ alias
  external: boolean
  note: string | null
  address: string | null
  salesStatus: SalesStatus
  tags: string[]
  phones: string[]
}

function toSalesStatus(v: string | null | undefined): SalesStatus {
  return v === 'INTERESTED' || v === 'NOT_INTERESTED' ? v : 'UNSPECIFIED'
}

/** อ่าน CRM ของเธรด (ownership scope shopId) — คืน null ถ้าไม่พบ/ไม่ใช่ของร้าน */
export async function getConversationCrm(conversationId: string, shopId: string): Promise<ConversationCrm | null> {
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, shopId },
    select: {
      alias: true,
      buyer: { select: { displayName: true } },
      externalContact: {
        select: { id: true, name: true, note: true, address: true, salesStatus: true, tags: true, phones: true },
      },
    },
  })
  if (!conv) return null
  const ec = conv.externalContact
  return {
    alias: conv.alias,
    realName: ec?.name ?? conv.buyer?.displayName ?? null,
    external: ec !== null,
    note: ec?.note ?? null,
    address: ec?.address ?? null,
    salesStatus: toSalesStatus(ec?.salesStatus),
    tags: ec?.tags ?? [],
    phones: ec?.phones ?? [],
  }
}

export type CrmInput = {
  alias?: string | null
  note?: string | null
  address?: string | null
  salesStatus?: SalesStatus
  tags?: string[]
  phones?: string[]
}

/** อัปเดต CRM ของเธรด — alias→Conversation, ฟิลด์อื่น→ExternalContact (เฉพาะ external thread) */
export async function updateConversationCrm(
  conversationId: string,
  shopId: string,
  input: CrmInput,
): Promise<ConversationCrm> {
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, shopId },
    select: { id: true, externalContactId: true },
  })
  if (!conv) throw new Error('CONVERSATION_NOT_FOUND')

  // แยกฟิลด์ที่ส่งมาจริง (undefined = ไม่แตะ) — alias ไป Conversation, ที่เหลือไป ExternalContact
  const contactData: Record<string, unknown> = {}
  if (input.note !== undefined) contactData.note = input.note
  if (input.address !== undefined) contactData.address = input.address
  if (input.salesStatus !== undefined) contactData.salesStatus = input.salesStatus
  if (input.tags !== undefined) contactData.tags = input.tags
  if (input.phones !== undefined) contactData.phones = input.phones

  await prisma.$transaction(async (tx) => {
    if (input.alias !== undefined) {
      await tx.conversation.update({ where: { id: conversationId }, data: { alias: input.alias } })
    }
    // CRM ฟิลด์ต้องมี ExternalContact (external thread) — DEEP thread ไม่มี → เงียบ (แก้ได้แค่ alias)
    if (conv.externalContactId && Object.keys(contactData).length > 0) {
      await tx.externalContact.update({ where: { id: conv.externalContactId }, data: contactData })
    }
  })

  const result = await getConversationCrm(conversationId, shopId)
  if (!result) throw new Error('CONVERSATION_NOT_FOUND')
  return result
}
