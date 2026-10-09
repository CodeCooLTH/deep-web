import 'server-only'
import { prisma } from '@/lib/prisma'
import { CHAT_MEMORY_MAX } from '@/lib/chat-memory-types'
import { canUseProducts, normalizeMemoryText } from '@/lib/chat-memory-rules'
import { resolveSuggestProvider } from '@/lib/reply-suggest-provider'
import { expandClusters } from '@/services/follow-up-scope'
import { listInterestedProducts } from '@/services/chat-interested-product.service'
import { getAiSetting, getEffectiveAiSetting } from '@/services/ai-setting.service'
import { isOwnerPaidPlan } from '@/services/ai-suggest-quota.service'
import type {
  ChatMemoryConflict,
  ChatMemoryDto,
  ChatMemoryGetResponse,
  ChatMemorySource,
  PromptProduct,
} from '@/lib/chat-memory-types'

// loadPromptMemory ยัง stub (T6)

/** รูปแถว ChatMemory เท่าที่ผู้ใช้ภายนอกต้องรู้ (Prisma model มาใน T1) */
export type ChatMemoryRow = {
  id: string
  shopId: string
  conversationId: string
  text: string
  source: ChatMemorySource
  version: number
  previousText: string | null
  updatedAt: Date
  aiUpdatedAt: Date | null
}

/** ความจำที่ห้องนี้ "เห็น" = แถวล่าสุดของห้องใน cluster ลูกค้าเดียวกัน (BR-MEM-06) · null = ห้องไม่ใช่ของร้าน */
export async function resolveEffectiveMemory(
  shopId: string,
  conversationId: string,
): Promise<{ row: ChatMemoryRow | null; shared: boolean; roomIds: string[] } | null> {
  const roomIds = (await expandClusters([conversationId], shopId)).get(conversationId)
  if (!roomIds) return null
  const row = (await prisma.chatMemory.findFirst({
    where: { shopId, conversationId: { in: roomIds } },
    orderBy: { updatedAt: 'desc' },
  })) as ChatMemoryRow | null
  return { row, shared: !!row && row.conversationId !== conversationId, roomIds }
}

function toDto(row: ChatMemoryRow, conversationId: string): ChatMemoryDto {
  return {
    text: row.text,
    source: row.source,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    aiUpdatedAt: row.aiUpdatedAt?.toISOString() ?? null,
    shared: row.conversationId !== conversationId,
    previousText: row.previousText,
  }
}

const UPDATING_WINDOW_MS = 30_000

export async function getMemoryPanel(shopId: string, conversationId: string): Promise<ChatMemoryGetResponse | null> {
  const eff = await resolveEffectiveMemory(shopId, conversationId)
  if (!eff) return null
  const provider = resolveSuggestProvider(shopId)
  const [products, productCount, stored, isPaid, running] = await Promise.all([
    listInterestedProducts(shopId, conversationId),
    prisma.product.count({ where: { shopId } }),
    getAiSetting(shopId),
    isOwnerPaidPlan(shopId).catch(() => false), // ล้ม = non-paid
    prisma.aiSuggestRun.findFirst({
      where: {
        shopId,
        conversationId, // ห้องนี้เท่านั้น — งานของห้องพี่น้องใน cluster ไม่ใช่ "AI กำลังอัปเดตห้องนี้"
        trigger: 'MEMORY_UPDATE',
        status: 'THINKING',
        createdAt: { gte: new Date(Date.now() - UPDATING_WINDOW_MS) },
      },
      select: { id: true },
    }),
  ])
  const setting = getEffectiveAiSetting(stored, isPaid)
  const list = products ?? []
  return {
    memory: eff.row ? toDto(eff.row, conversationId) : null,
    products: list,
    canUseProducts: canUseProducts({ productCount, interestedCount: list.length }),
    ai: {
      provider,
      writes: provider === 'typhoon',
      readsMemory: setting.includeCustomerContext,
      readsProducts: setting.includeProductContext,
      updating: !!running,
      noteReadByAi: provider === 'gemini',
    },
  }
}

export type SaveMemoryResult =
  | { ok: true; memory: ChatMemoryDto }
  | { ok: false; code: 'NOT_FOUND' | 'INVALID_TEXT' }
  | { ok: false; code: 'VERSION_CONFLICT'; current: ChatMemoryConflict['current'] }

const conflictOf = (row: ChatMemoryRow | null): SaveMemoryResult => ({
  ok: false,
  code: 'VERSION_CONFLICT',
  current: row
    ? { text: row.text, version: row.version, source: row.source, updatedAt: row.updatedAt.toISOString() }
    : null,
})

export async function saveMemoryByAdmin(p: {
  shopId: string
  conversationId: string
  userId: string
  text: string
  expectedVersion: number | null
}): Promise<SaveMemoryResult> {
  const { shopId, conversationId } = p
  const eff = await resolveEffectiveMemory(shopId, conversationId)
  if (!eff) return { ok: false, code: 'NOT_FOUND' }
  const text = normalizeMemoryText(p.text)
  if (text.length > CHAT_MEMORY_MAX) return { ok: false, code: 'INVALID_TEXT' }
  const { row } = eff

  const reread = async (id: string) =>
    (await prisma.chatMemory.findFirst({ where: { id, shopId } })) as ChatMemoryRow | null

  if (!row) {
    if (p.expectedVersion !== null) return conflictOf(null)
    // ponytail: แอดมินสองคนในคนละห้องของ cluster เดียวกันสร้างความจำแถวแรกพร้อมกัน (ระดับ ms) → ได้ 2 แถว
    // แล้ว "ใหม่สุดชนะ" ซ่อนอีกแถว (ไม่ลบ) — ยอมรับเพราะเกิดได้เฉพาะครั้งแรกของลูกค้าคนนั้น · ถ้าเจอจริง ใช้ advisory lock ต่อ cluster
    // createMany skipDuplicates: ชนกัน = count 0 (ไม่เกิด ERROR ใน log ของ Postgres)
    const { count } = await prisma.chatMemory.createMany({
      data: [{ shopId, conversationId, text, source: 'ADMIN', version: 1, updatedByUserId: p.userId }],
      skipDuplicates: true,
    })
    const created = (await prisma.chatMemory.findFirst({ where: { shopId, conversationId } })) as ChatMemoryRow | null
    return count === 1 && created ? { ok: true, memory: toDto(created, conversationId) } : conflictOf(created)
  }

  if (p.expectedVersion !== row.version) return conflictOf(row)
  // ข้อความเท่าเดิม ไม่เขียน — ไม่ bump version / ไม่ให้ previousText ซ้ำตัวเอง
  if (text === row.text) return { ok: true, memory: toDto(row, conversationId) }

  const { count } = await prisma.chatMemory.updateMany({
    where: { id: row.id, shopId, version: row.version },
    data: {
      text,
      source: 'ADMIN',
      version: row.version + 1,
      previousText: row.text || null,
      updatedByUserId: p.userId,
    },
  })
  const fresh = await reread(row.id)
  if (count !== 1 || !fresh) return conflictOf(fresh)
  return { ok: true, memory: toDto(fresh, conversationId) }
}

export type { PromptProduct }
export type PromptMemory = { memory: { text: string; updatedDay: string } | null; products: PromptProduct[] }

/** fail-soft: ไม่ throw (NFR-MEM-Failsoft) · includeX=false → ไม่อ่านส่วนนั้นเลย */
export async function loadPromptMemory(p: {
  shopId: string
  conversationId: string
  includeMemory: boolean
  includeProducts: boolean
}): Promise<PromptMemory> {
  void p
  throw new Error('NOT_IMPLEMENTED')
}
