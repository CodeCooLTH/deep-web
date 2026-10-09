import type { ChatMemoryAi, ChatMemorySource, InterestedProductState } from '@/lib/chat-memory-types'

// stub ของ G0 (contract freeze) — เนื้อจริงมาใน TF0 (pure)

export function shouldShowProductsSection(i: { canUseProducts: boolean; rowCount: number }): boolean {
  void i
  throw new Error('NOT_IMPLEMENTED')
}

export function canAddMoreProducts(rowCount: number): boolean {
  void rowCount
  throw new Error('NOT_IMPLEMENTED')
}

export function productRowView(state: InterestedProductState): {
  tappable: boolean
  badge: 'inactive' | 'deleted' | null
  hint: 'noSend' | null
} {
  void state
  throw new Error('NOT_IMPLEMENTED')
}

export function shouldClampMemory(text: string): boolean {
  void text
  throw new Error('NOT_IMPLEMENTED')
}

export function memoryMetaKind(i: {
  source: ChatMemorySource
  shared: boolean
  updating: boolean
  writes: boolean
}): 'ai' | 'admin' | 'updating' | 'adminOnly' {
  void i
  throw new Error('NOT_IMPLEMENTED')
}

export function noteHintKind(ai: ChatMemoryAi | null): 'reads' | 'ignores' | 'neutral' {
  void ai
  throw new Error('NOT_IMPLEMENTED')
}
