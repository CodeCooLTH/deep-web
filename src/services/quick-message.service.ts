import { prisma } from '@/lib/prisma'

// ข้อความสำเร็จรูป (canned reply) ระดับร้าน — feature 00018 composer improvement #2
// ownership: shopId มาจาก resolveActiveShopContext ที่ route (verify membership แล้ว) — service
// scope ทุก query/mutation ด้วย shopId ใน WHERE เสมอ (atomic updateMany/deleteMany) ไม่ post-check
// pattern เดียวกับ updateConversationState / disconnectChannel

export type QuickMessageView = {
  id: string
  title: string
  category: string | null
  body: string
  imageFileId: string | null
  createdAt: string
}

type QuickMessageRow = {
  id: string
  title: string
  category: string | null
  body: string
  imageFileId: string | null
  createdAt: Date
}

function toView(q: QuickMessageRow): QuickMessageView {
  return {
    id: q.id,
    title: q.title,
    category: q.category,
    body: q.body,
    imageFileId: q.imageFileId,
    createdAt: q.createdAt.toISOString(),
  }
}

const SELECT = {
  id: true,
  title: true,
  category: true,
  body: true,
  imageFileId: true,
  createdAt: true,
} as const

export async function listQuickMessages(shopId: string): Promise<QuickMessageView[]> {
  const rows = await prisma.quickMessage.findMany({
    where: { shopId },
    orderBy: [{ category: 'asc' }, { createdAt: 'desc' }],
    select: SELECT,
  })
  return rows.map(toView)
}

export type QuickMessageInput = {
  title: string
  category: string | null
  body: string
  imageFileId: string | null
}

export async function createQuickMessage(
  shopId: string,
  userId: string,
  input: QuickMessageInput,
): Promise<QuickMessageView> {
  const row = await prisma.quickMessage.create({
    data: {
      shopId,
      createdByUserId: userId,
      title: input.title,
      category: input.category,
      body: input.body,
      imageFileId: input.imageFileId,
    },
    select: SELECT,
  })
  return toView(row)
}

/** update — scope ด้วย {id, shopId} ป้องกันแก้ข้ามร้าน; ไม่พบ (0 แถว) → throw NOT_FOUND */
export async function updateQuickMessage(
  id: string,
  shopId: string,
  input: QuickMessageInput,
): Promise<QuickMessageView> {
  const result = await prisma.quickMessage.updateMany({
    where: { id, shopId },
    data: {
      title: input.title,
      category: input.category,
      body: input.body,
      imageFileId: input.imageFileId,
    },
  })
  if (result.count === 0) throw new Error('QUICK_MESSAGE_NOT_FOUND')
  const row = await prisma.quickMessage.findUnique({ where: { id }, select: SELECT })
  // row ต้องมีจริง (เพิ่ง update สำเร็จ) — defense null-safe
  if (!row) throw new Error('QUICK_MESSAGE_NOT_FOUND')
  return toView(row)
}

/** delete — scope ด้วย {id, shopId}; ไม่พบ → throw NOT_FOUND */
export async function deleteQuickMessage(id: string, shopId: string): Promise<void> {
  const result = await prisma.quickMessage.deleteMany({ where: { id, shopId } })
  if (result.count === 0) throw new Error('QUICK_MESSAGE_NOT_FOUND')
}
