import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { localReadAtOf, markLocalRead } from '@/lib/chat-local-read'

// [blocker] bug prod 2026-09-30 (คลิปจาก user): กลับจากห้องแชทบนมือถือ badge unread เก่าโผล่ ~1 วิ
// เพราะ mark-read ฝั่ง client อยู่ใน state ของ InboxList ซึ่ง unmount ทุกครั้งที่เข้าห้อง
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const read = (rel: string) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'))

describe('chat-local-read', () => {
  it('จำเวลาอ่านข้ามการ remount (ระดับ module)', () => {
    markLocalRead('c1', new Date('2026-09-30T02:00:00Z'))
    expect(localReadAtOf('c1')).toBe('2026-09-30T02:00:00.000Z')
    expect(localReadAtOf('never')).toBeUndefined()
  })

  it('[blocker] ห้องแชทยิง /read ผ่าน postMarkRead เท่านั้น (จด markLocalRead ทุกครั้ง)', () => {
    const src = read('../../app/(paces)/seller/(dashboard)/_shared/useSellerChatThread.ts')
    const rawCalls = src.split('\n').filter((l) => l.includes('/read`') && l.includes('fetch(')).length
    // fetch /read ต้องมีจุดเดียว = ในตัว postMarkRead ที่เรียก markLocalRead ก่อน
    expect(rawCalls).toBe(1)
    const helper = src.slice(src.indexOf('function postMarkRead'))
    expect(helper.slice(0, helper.indexOf('fetch('))).toMatch(/markLocalRead\(conversationId\)/)
  })

  it('[blocker] InboxList คำนวณ unread โดยอ่าน localReadAtOf (ไม่ใช่แค่ state ที่หายตอน unmount)', () => {
    const src = read('../../app/(paces)/seller/(chat)/inbox/components/InboxList.tsx')
    const line = src.split('\n').find((l) => l.includes('const unreadCount =') && l.includes('unreadCountOf('))
    expect(line).toBeDefined()
    expect(line).toMatch(/localReadAtOf\(c\.id\)/)
  })
})
