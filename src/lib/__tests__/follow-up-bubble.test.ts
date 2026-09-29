import { describe, it, expect } from 'vitest'
import { applyBubbleChange, bubbleLift, isComposerPath } from '@/lib/follow-up-bubble'

const row = (id: string, bucket: string, status = 'OPEN') => ({ id, bucket, status })
const data = () => ({ rows: [row('a', 'late'), row('b', 'today')], total: 2, lateCount: 1 })

describe('bubbleLift [blocker]', () => {
  it('ยกตามจำนวนสิ่งที่กีดขวาง', () => {
    expect(bubbleLift({ composerPresent: false, dockVisible: false })).toBe(0)
    expect(bubbleLift({ composerPresent: true, dockVisible: false })).toBe(1)
    expect(bubbleLift({ composerPresent: false, dockVisible: true })).toBe(1)
    expect(bubbleLift({ composerPresent: true, dockVisible: true })).toBe(2)
  })
})

describe('applyBubbleChange [blocker]', () => {
  it('ทำแล้ว (upsert เป็น DONE) → แถวหาย · เลขบนปุ่มลดตามชนิด', () => {
    const r = applyBubbleChange(data(), { kind: 'upsert', item: row('a', 'done', 'DONE') })
    expect(r).toEqual({ rows: [row('b', 'today')], total: 1, lateCount: 0 })
  })
  it('แถววันนี้ปิด → lateCount ไม่ลด', () => {
    const r = applyBubbleChange(data(), { kind: 'remove', id: 'b' })
    expect(r.total).toBe(1)
    expect(r.lateCount).toBe(1)
  })
  it('เลื่อนพ้นวันนี้ → หลุดจาก bubble', () => {
    const r = applyBubbleChange(data(), { kind: 'upsert', item: row('a', 'week') })
    expect(r.rows.map((x) => x.id)).toEqual(['b'])
    expect(r.lateCount).toBe(0)
  })
  it('แก้แล้วยังอยู่วันนี้ → แทนที่แถว เลขคงเดิมยกเว้นเลยกำหนดเปลี่ยน', () => {
    const r = applyBubbleChange(data(), { kind: 'upsert', item: row('a', 'today') })
    expect(r.total).toBe(2)
    expect(r.lateCount).toBe(0)
  })
  it('id ที่ไม่มีในกล่อง / refresh = คงเดิม (ไม่หักเลขซ้ำ)', () => {
    const d = data()
    expect(applyBubbleChange(d, { kind: 'remove', id: 'zzz' })).toBe(d)
    expect(applyBubbleChange(d, { kind: 'refresh' })).toBe(d)
  })
  it('total ไม่ติดลบ', () => {
    const d = { rows: [row('a', 'late')], total: 0, lateCount: 0 }
    expect(applyBubbleChange(d, { kind: 'remove', id: 'a' }).total).toBe(0)
  })
})

describe('isComposerPath [blocker]', () => {
  it('ห้องแชท + คอมเมนต์ = มีช่องพิมพ์ · รายการ = ไม่มี', () => {
    expect(isComposerPath('/inbox/abc123')).toBe(true)
    expect(isComposerPath('/inbox/comments')).toBe(true)
    expect(isComposerPath('/inbox/comments/x')).toBe(true)
    expect(isComposerPath('/inbox')).toBe(false)
    expect(isComposerPath(null)).toBe(false)
  })
})
