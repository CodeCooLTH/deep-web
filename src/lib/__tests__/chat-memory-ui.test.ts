import { describe, it, expect } from 'vitest'
import {
  canAddMoreProducts,
  memoryMetaKind,
  noteHintKind,
  productRowView,
  shouldClampMemory,
  shouldShowProductsSection,
} from '@/lib/chat-memory-ui'
import { INTERESTED_PRODUCT_MAX } from '@/lib/chat-memory-types'
import type { ChatMemoryAi } from '@/lib/chat-memory-types'

const ai = (o: Partial<ChatMemoryAi>): ChatMemoryAi => ({
  provider: 'none', writes: false, readsMemory: true, readsProducts: true, updating: false, noteReadByAi: false, ...o,
})

describe('shouldShowProductsSection', () => {
  it('ใช้สินค้าได้ = โชว์แม้ว่าง', () => expect(shouldShowProductsSection({ canUseProducts: true, rowCount: 0 })).toBe(true))
  it('ใช้ไม่ได้แต่มีแถวค้าง = โชว์', () => expect(shouldShowProductsSection({ canUseProducts: false, rowCount: 2 })).toBe(true))
  it('ใช้ไม่ได้และว่าง = ซ่อน', () => expect(shouldShowProductsSection({ canUseProducts: false, rowCount: 0 })).toBe(false))
})

describe('canAddMoreProducts', () => {
  it('ที่เพดาน-1 เพิ่มได้', () => expect(canAddMoreProducts(INTERESTED_PRODUCT_MAX - 1)).toBe(true))
  it('ที่เพดาน เพิ่มไม่ได้', () => expect(canAddMoreProducts(INTERESTED_PRODUCT_MAX)).toBe(false))
  it('เกินเพดาน เพิ่มไม่ได้', () => expect(canAddMoreProducts(INTERESTED_PRODUCT_MAX + 1)).toBe(false))
  it('ว่างเพิ่มได้', () => expect(canAddMoreProducts(0)).toBe(true))
})

describe('productRowView', () => {
  it('ACTIVE แตะได้ ไม่มีป้าย', () => expect(productRowView('ACTIVE')).toEqual({ tappable: true, badge: null, hint: null }))
  it('INACTIVE แตะไม่ได้ ป้ายปิดขาย', () =>
    expect(productRowView('INACTIVE')).toEqual({ tappable: false, badge: 'inactive', hint: 'noSend' }))
  it('DELETED แตะไม่ได้ ป้ายถูกลบ', () =>
    expect(productRowView('DELETED')).toEqual({ tappable: false, badge: 'deleted', hint: 'noSend' }))
})

describe('shouldClampMemory', () => {
  it('280 พอดีไม่ตัด', () => expect(shouldClampMemory('ก'.repeat(280))).toBe(false))
  it('281 ตัด', () => expect(shouldClampMemory('ก'.repeat(281))).toBe(true))
  it('ว่างไม่ตัด', () => expect(shouldClampMemory('')).toBe(false))
})

describe('memoryMetaKind', () => {
  const base = { source: 'AI' as const, shared: false, updating: false, writes: true }
  it('updating ชนะทุกอย่าง', () => {
    expect(memoryMetaKind({ ...base, updating: true })).toBe('updating')
    expect(memoryMetaKind({ ...base, source: 'ADMIN', updating: true })).toBe('updating')
  })
  it('AI = ai', () => expect(memoryMetaKind(base)).toBe('ai'))
  it('ADMIN + ร้าน AI เขียนได้ = admin', () => expect(memoryMetaKind({ ...base, source: 'ADMIN' })).toBe('admin'))
  it('ADMIN + ร้าน AI ไม่เขียน = adminOnly', () =>
    expect(memoryMetaKind({ ...base, source: 'ADMIN', writes: false })).toBe('adminOnly'))
  it('shared ไม่เปลี่ยนผล', () => {
    expect(memoryMetaKind({ ...base, shared: true })).toBe('ai')
    expect(memoryMetaKind({ ...base, source: 'ADMIN', shared: true })).toBe('admin')
  })
})

describe('noteHintKind', () => {
  it('null = neutral', () => expect(noteHintKind(null)).toBe('neutral'))
  it('gemini (noteReadByAi) = reads', () => expect(noteHintKind(ai({ provider: 'gemini', noteReadByAi: true }))).toBe('reads'))
  it('typhoon = ignores', () => expect(noteHintKind(ai({ provider: 'typhoon', writes: true }))).toBe('ignores'))
  it('none = neutral', () => expect(noteHintKind(ai({ provider: 'none' }))).toBe('neutral'))
  it('noteReadByAi ชนะ provider', () => expect(noteHintKind(ai({ provider: 'typhoon', noteReadByAi: true }))).toBe('reads'))
})
