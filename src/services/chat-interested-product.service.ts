import 'server-only'
import type { InterestedProductDto, OptionSelection } from '@/lib/chat-memory-types'
import type { PromptProduct } from '@/services/chat-memory.service'

// stub ของ G0 (contract freeze) — เนื้อจริงมาใน T5

export type AddInterestedResult =
  | { ok: true; item: InterestedProductDto }
  | { ok: false; code: 'NOT_FOUND' | 'PRODUCT_NOT_FOUND' | 'DUPLICATE' | 'LIMIT_REACHED' | 'INVALID_OPTION' }

export async function addInterestedProduct(p: {
  shopId: string
  conversationId: string
  userId: string
  productId: string
  selections?: OptionSelection[]
}): Promise<AddInterestedResult> {
  void p
  throw new Error('NOT_IMPLEMENTED')
}

export async function removeInterestedProduct(p: {
  shopId: string
  conversationId: string
  rowId: string
}): Promise<{ ok: boolean }> {
  void p
  throw new Error('NOT_IMPLEMENTED')
}

export async function listInterestedProducts(shopId: string, conversationId: string): Promise<InterestedProductDto[] | null> {
  void shopId, conversationId
  throw new Error('NOT_IMPLEMENTED')
}

export async function listInterestedForPrompt(shopId: string, conversationId: string): Promise<PromptProduct[]> {
  void shopId, conversationId
  throw new Error('NOT_IMPLEMENTED')
}
