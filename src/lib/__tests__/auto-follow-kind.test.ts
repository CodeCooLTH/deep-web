// 00095 S-5 — ค่า AUTO_FOLLOW / FOLLOW_BOT_NOTE ที่ฝั่ง lib/source ต้องรู้จัก (TFR-FB-17/18)
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  AUTO_FOLLOW_KIND, AUTO_REPLY_KINDS, isFollowBotKind, shopSendSenderRolePatch,
} from '@/lib/auto-reply-constants'
import { FOLLOW_BOT_NOTE_TYPE, INTERNAL_MESSAGE_TYPES } from '@/lib/auto-order-message-type'
import { pickDesk } from '@/lib/chat-desk/rules'
import { previewPrefix } from '@/lib/preview-attribution'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('AUTO_FOLLOW (TFR-FB-18)', () => {
  it('ค่าคงที่ + ไม่ใช่ "บอทตอบแชท" (ไม่อยู่ใน AUTO_REPLY_KINDS)', () => {
    expect(AUTO_FOLLOW_KIND).toBe('AUTO_FOLLOW')
    expect(isFollowBotKind('AUTO_FOLLOW')).toBe(true)
    expect(isFollowBotKind('AUTO')).toBe(false)
    expect((AUTO_REPLY_KINDS as readonly string[]).includes('AUTO_FOLLOW')).toBe(false)
  })

  it('#1 shopSendSenderRolePatch ไม่เขียน lastSenderRole ให้ AUTO_FOLLOW (ควบคุม: คน/บอทตอบยังเขียน)', () => {
    expect(shopSendSenderRolePatch('AUTO_FOLLOW')).toEqual({})
    expect(shopSendSenderRolePatch('AUTO')).toEqual({ lastSenderRole: 'SHOP' })
    expect(shopSendSenderRolePatch(null)).toEqual({ lastSenderRole: 'SHOP' })
  })

  it('#6 pickDesk: AUTO_FOLLOW ไม่ใช่โต๊ะบอท (ควบคุม: AUTO เป็น BOT)', () => {
    const base = { viaStandby: false, senderUserId: null }
    expect(pickDesk({ ...base, autoReplyKind: 'AUTO' }, []).kind).toBe('BOT')
    expect(pickDesk({ ...base, autoReplyKind: 'AUTO_FOLLOW' }, []).kind).not.toBe('BOT')
  })

  it('#8 previewPrefix: ฝั่งร้านขึ้น FOLLOW_BOT · ฝั่งผู้ซื้อไม่มีคำนำหน้า', () => {
    const c = { lastSenderRole: 'BUYER' as const, lastMessageIsFollowBot: true, hasPreview: true }
    expect(previewPrefix('SELLER', c)).toBe('FOLLOW_BOT')
    expect(previewPrefix('BUYER', c)).toBeNull()
    expect(previewPrefix('SELLER', { ...c, lastMessageIsFollowBot: false })).toBeNull()
  })
})

describe('FOLLOW_BOT_NOTE (TFR-FB-17)', () => {
  it('อยู่ใน INTERNAL_MESSAGE_TYPES', () => {
    expect(FOLLOW_BOT_NOTE_TYPE).toBe('FOLLOW_BOT_NOTE')
    expect(INTERNAL_MESSAGE_TYPES).toContain(FOLLOW_BOT_NOTE_TYPE)
  })
})

describe('#11 ตัวกรอง internal ทุกจุดใช้ INTERNAL_MESSAGE_TYPES (grep gate + ต่อจุด)', () => {
  const files = [
    'src/services/chat-memory-ai.service.ts',
    'src/services/ai-suggest-auto.service.ts',
    'src/app/api/chat/conversations/[id]/ai-suggest/route.ts',
    'src/services/chat-metrics.service.ts',
    'src/app/api/cron/auto-order-sweeper/route.ts',
    'src/app/api/chat/conversations/[id]/memory/refresh/route.ts',
    'src/services/auto-reply.service.ts',
    'src/services/chat.service.ts',
  ]
  it.each(files)('%s', (f) => {
    const s = src(f)
    expect(s).not.toMatch(/not: AUTO_ORDER_RESULT_TYPE/)
    expect(s).toMatch(/notIn: \[\.\.\.INTERNAL_MESSAGE_TYPES\]/)
  })
  it('chat.service StoredMessageType รู้จัก FOLLOW_BOT_NOTE', () => {
    expect(src('src/services/chat.service.ts')).toMatch(/StoredMessageType = [^\n]*FOLLOW_BOT_NOTE_TYPE/)
  })
})
