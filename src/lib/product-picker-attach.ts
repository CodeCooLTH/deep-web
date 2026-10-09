/**
 * ตรรกะ pure ของ ProductPickerPanel โหมด attach (00019-ext-mem T9) — แยกมาเพื่อให้เทสจับได้
 * (docs/conventions/ui-boolean-needs-a-testable-home)
 */
import { splitAttributeValues } from '@/lib/product-attributes'
import type { OptionSelection } from '@/lib/chat-memory-types'

export type OptionPicks = Record<string, Record<string, string>> // productId -> key -> value

/** หัวข้อตัวเลือกของสินค้า: key + ค่าที่แยกแล้ว (ตัดหัวข้อที่ไม่มีค่า/ค่าไม่ใช่ string) */
export function optionGroupsOf(attrs: Record<string, string> | null | undefined): { key: string; values: string[] }[] {
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return []
  return Object.keys(attrs)
    .map((key) => ({ key, values: typeof attrs[key] === 'string' ? splitAttributeValues(attrs[key]) : [] }))
    .filter((g) => g.values.length > 0)
}

/** เลือก 1 ค่าต่อหัวข้อ — กดค่าเดิมซ้ำ = ยกเลิก (คืน object ใหม่ ไม่แก้ของเดิม) */
export function toggleOptionPick(picks: OptionPicks, productId: string, key: string, value: string): OptionPicks {
  const cur = { ...(picks[productId] ?? {}) }
  if (cur[key] === value) delete cur[key]
  else cur[key] = value
  return { ...picks, [productId]: cur }
}

/** ประกอบ payload onAttach ตามลำดับที่ติ๊ก — ทิ้ง option ของสินค้าที่ไม่ได้ติ๊กแล้ว */
export function buildAttachPicks(
  selectedIds: string[],
  picks: OptionPicks,
): { productId: string; selections: OptionSelection[] }[] {
  return selectedIds.map((productId) => ({
    productId,
    selections: Object.entries(picks[productId] ?? {}).map(([key, value]) => ({ key, value })),
  }))
}

export type EscapeAction = 'back-options' | 'back-pick' | 'clear' | 'close'

/** Esc ถอยทีละชั้นในโหมด attach: options → pick → ล้างติ๊ก → ปิด */
export function attachEscapeAction(step: 'pick' | 'options', count: number): EscapeAction {
  if (step === 'options') return 'back-options'
  return count > 0 ? 'clear' : 'close'
}
