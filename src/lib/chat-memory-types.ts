/**
 * สัญญา (contract) ของความจำแชท + สินค้าที่สนใจ — 00019-ext-mem (pure, client-safe ไม่มี server-only)
 * อ้างอิง: docs/superpowers/plans/2026-10-09-00019-ext-mem-plan.md หัวข้อ 2.2
 */
import type { MemoryUpdateOutcome } from '@/lib/ai-suggest-auto-types'

export const CHAT_MEMORY_MAX = 800
export const INTERESTED_PRODUCT_MAX = 10
export const SELECTIONS_MAX = 10 // จำนวนหัวข้อตัวเลือกต่อคำขอ
export const MEMORY_AI_MIN_NEW_MESSAGES = 3
export const MEMORY_AI_FIRST_MIN_MESSAGES = 4 // ยังไม่มีความจำ: ห้อง >= 4 ข้อความ
export const MEMORY_AI_FIRST_MIN_BUYER = 2 // และลูกค้า >= 2
export const MEMORY_AI_COOLDOWN_MS = 120_000
export const MEMORY_AI_WINDOW = 40
export const MEMORY_RPM_SHARE = 0.7
export const MEMORY_SLOT_WAIT_MS = 2_000
export const MEMORY_SHRINK_RATIO = 0.5
export const MEMORY_SHRINK_BASE_MIN = 100

export type ChatMemorySource = 'AI' | 'ADMIN'
export type InterestedProductState = 'ACTIVE' | 'INACTIVE' | 'DELETED'

export type ChatMemoryDto = {
  text: string
  source: ChatMemorySource
  version: number
  updatedAt: string
  aiUpdatedAt: string | null
  shared: boolean // แถวจริงมาจากห้องอื่นใน cluster
  previousText: string | null // มติ UX (S-11)
}
export type InterestedProductDto = {
  id: string
  productId: string | null
  name: string
  optionLabel: string
  state: InterestedProductState
  imageFileId: string | null
}
export type ChatMemoryAi = {
  provider: 'typhoon' | 'gemini' | 'none'
  writes: boolean // provider === 'typhoon'
  readsMemory: boolean // includeCustomerContext (หลัง getEffectiveAiSetting)
  readsProducts: boolean // includeProductContext (หลัง getEffectiveAiSetting)
  updating: boolean // มีแถว MEMORY_UPDATE status THINKING อายุ <= 30 วิ ของห้องนี้
  noteReadByAi: boolean // provider === 'gemini'
}
export type ChatMemoryGetResponse = {
  memory: ChatMemoryDto | null
  products: InterestedProductDto[]
  canUseProducts: boolean
  ai: ChatMemoryAi
}
export type ChatMemoryPutBody = { text: string; expectedVersion: number | null }
export type ChatMemoryPutResponse = { memory: ChatMemoryDto }
export type ChatMemoryConflict = {
  error: 'VERSION_CONFLICT'
  current: { text: string; version: number; source: ChatMemorySource; updatedAt: string } | null
} // null = ไม่มีแถว (client ถือเป็นว่าง)
export type OptionSelection = { key: string; value: string }
export type InterestedProductPostBody = { productId: string; selections?: OptionSelection[] }
export type InterestedProductPostResponse = { item: InterestedProductDto }
export type MemoryRefreshResponse = { status: 'UPDATED' | 'THINKING' | 'NONE'; reason?: MemoryUpdateOutcome }

/** สินค้าที่สนใจในรูปที่ใช้ประกอบ prompt (ย้ายมาจาก service เพื่อให้ lib ไม่พึ่ง services) */
export type PromptProduct = {
  name: string
  optionLabel: string
  state: InterestedProductState
  price: string | null
  stockQty: number | null
}
