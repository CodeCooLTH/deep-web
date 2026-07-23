import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// กลุ่ม/แท็บจัดหมวดแชท (feature 00018, user request 2026-07-23) — ระดับร้าน (shopId)
// ownership อยู่ใน WHERE ทุก query (shopId มาจาก resolveActiveShopContext ที่ route) — ไม่ query แยกก่อน (กัน IDOR)

export interface ChatGroupView {
  id: string
  name: string
  sortOrder: number
}

const MAX_GROUPS_PER_SHOP = 30 // กันสร้างมั่ว (แท็บล้นจอ)
const MAX_NAME_LEN = 40

export async function listChatGroups(shopId: string): Promise<ChatGroupView[]> {
  const rows = await prisma.chatGroup.findMany({
    where: { shopId },
    select: { id: true, name: true, sortOrder: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
  return rows
}

/** สร้างกลุ่มใหม่ — ต่อท้าย (sortOrder = จำนวนที่มีอยู่). ชื่อซ้ำ (@@unique shopId+name) → error 'GROUP_NAME_TAKEN' */
export async function createChatGroup(shopId: string, rawName: string): Promise<ChatGroupView> {
  const name = rawName.trim()
  if (!name) throw new Error('GROUP_NAME_EMPTY')
  if (name.length > MAX_NAME_LEN) throw new Error('GROUP_NAME_TOO_LONG')

  const count = await prisma.chatGroup.count({ where: { shopId } })
  if (count >= MAX_GROUPS_PER_SHOP) throw new Error('GROUP_LIMIT_REACHED')

  try {
    const g = await prisma.chatGroup.create({
      data: { shopId, name, sortOrder: count },
      select: { id: true, name: true, sortOrder: true },
    })
    return g
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new Error('GROUP_NAME_TAKEN')
    throw e
  }
}

export async function renameChatGroup(id: string, shopId: string, rawName: string): Promise<void> {
  const name = rawName.trim()
  if (!name) throw new Error('GROUP_NAME_EMPTY')
  if (name.length > MAX_NAME_LEN) throw new Error('GROUP_NAME_TOO_LONG')
  try {
    // updateMany + guard shopId ใน WHERE (atomic ownership — กัน IDOR/TOCTOU) pattern เดียวกับ updateConversationState
    const r = await prisma.chatGroup.updateMany({ where: { id, shopId }, data: { name } })
    if (r.count === 0) throw new Error('GROUP_NOT_FOUND')
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new Error('GROUP_NAME_TAKEN')
    throw e
  }
}

/** ลบกลุ่ม — เธรดที่เคยอยู่กลุ่มนี้ chatGroupId กลับเป็น null (FK onDelete: SetNull) กลับไปแท็บ "ทั้งหมด" เอง */
export async function deleteChatGroup(id: string, shopId: string): Promise<void> {
  const r = await prisma.chatGroup.deleteMany({ where: { id, shopId } })
  if (r.count === 0) throw new Error('GROUP_NOT_FOUND')
}

/** ย้ายเธรดเข้ากลุ่ม (chatGroupId) หรือเอาออก (null). ตรวจว่ากลุ่มเป็นของร้านนี้จริงก่อน (กันย้ายเข้ากลุ่มร้านอื่น) */
export async function setConversationGroup(
  conversationId: string,
  shopId: string,
  chatGroupId: string | null,
): Promise<void> {
  if (chatGroupId !== null) {
    const owns = await prisma.chatGroup.findFirst({ where: { id: chatGroupId, shopId }, select: { id: true } })
    if (!owns) throw new Error('GROUP_NOT_FOUND')
  }
  const r = await prisma.conversation.updateMany({ where: { id: conversationId, shopId }, data: { chatGroupId } })
  if (r.count === 0) throw new Error('CONVERSATION_NOT_FOUND_OR_FORBIDDEN')
}
