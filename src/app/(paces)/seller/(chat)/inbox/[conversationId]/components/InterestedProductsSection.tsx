'use client'

/**
 * InterestedProductsSection — "สินค้าที่สนใจ" (00019-ext-mem)
 * STUB: T10 วางจุด mount + props ไว้ก่อน (คืน null) — T11 ทำเนื้อหาจริงที่ไฟล์นี้ไฟล์เดียว
 */
import type { useChatMemory } from './useChatMemory'

export type InterestedProductsSectionProps = {
  conversationId: string
  channel: string // ส่งต่อให้ picker
  state: ReturnType<typeof useChatMemory>
  onRequestClose?: () => void // sheet เท่านั้น: ปิด sheet หลังยิง PRODUCT_TRAY_OPEN_EVENT
}

export default function InterestedProductsSection(props: InterestedProductsSectionProps) {
  void props
  return null
}
