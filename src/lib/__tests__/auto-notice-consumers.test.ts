/**
 * 00078 S-10 (TC-100/103/104) — ผู้บริโภค autoReplyKind แยก "บอทตอบแชท" / "ข้อความระบบแจ้ง" / "คน" ให้ถูก
 * pure + static เท่านั้น (ไม่แตะ DB) — ผลข้างเคียงบนฐานจริงอยู่ที่ services/__tests__/auto-notice-side-effects.test.ts
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { AUTO_REPLY_KINDS, isBotReplyKind, isSystemNoticeKind, shopSendSenderRolePatch } from '@/lib/auto-reply-constants'
import { pickDesk } from '@/lib/chat-desk/rules'
import { isHumanAgentReply, isUnattributedShopReply } from '@/lib/agent-performance'
import { buyerHasUnreadFromShop } from '@/lib/buyer-unread'
import { humanAgentReplySql } from '@/lib/agent-performance-sql'

const notice = { senderRole: 'SHOP', senderUserId: null as string | null, autoReplyKind: 'AUTO_NOTICE' as string | null }
const ev = (o: Partial<typeof notice>) => ({ conversationId: 'c', createdAt: new Date(), seq: 1, isDeleted: false, ...notice, ...o })

describe('AUTO_NOTICE ไม่ใช่บอท ไม่ใช่คน (TC-100)', () => {
  it('00059: ไม่นับเป็นการตอบของแอดมิน และไม่นับเป็น "ตอบนอกระบบ"', () => {
    expect(isHumanAgentReply(ev({ senderUserId: 'u1' }))).toBe(false)
    expect(isHumanAgentReply(ev({}))).toBe(false)
    expect(isUnattributedShopReply(ev({}))).toBe(false)
    // ควบคุม: ถ้า kind หาย (M-12) ข้อความระบบจะกลายเป็น "ตอบนอกระบบ" — เทสข้างบนจึงไวต่อการถดถอย
    expect(isUnattributedShopReply(ev({ autoReplyKind: null }))).toBe(true)
  })

  it('00077: pickDesk ไม่ส่ง AUTO_NOTICE ไปโต๊ะบอท · บอทจริงยังไปโต๊ะบอท', () => {
    const base = { viaStandby: false, senderUserId: null }
    expect(pickDesk({ ...base, autoReplyKind: 'AUTO_NOTICE' }, []).kind).not.toBe('BOT')
    expect(pickDesk({ ...base, autoReplyKind: 'AUTO' }, [])).toEqual({ kind: 'BOT' })
    expect(pickDesk({ ...base, autoReplyKind: 'AUTO_TEST' }, [])).toEqual({ kind: 'BOT' })
  })

  it('SSOT: บอท = AUTO/AUTO_TEST · AUTO_NOTICE แยกต่างหาก', () => {
    expect([...AUTO_REPLY_KINDS]).toEqual(['AUTO', 'AUTO_TEST'])
    expect(isBotReplyKind('AUTO_NOTICE')).toBe(false)
    expect(isSystemNoticeKind('AUTO_NOTICE')).toBe(true)
  })

  it('SQL ของรายงาน 00059 ยังกำหนด "คน" ด้วย autoReplyKind IS NULL', () => {
    const m = { senderRole: 'm."senderRole"', autoReplyKind: 'm."autoReplyKind"', senderUserId: 'm."senderUserId"', isDeleted: 'm."isDeleted"' }
    expect(humanAgentReplySql(m as never)).toContain('m."autoReplyKind" IS NULL')
  })
})

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (n === 'node_modules' || n === '__tests__') continue
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\./.test(n)) out.push(p)
  }
  return out
}

describe('AUTO_NOTICE ไม่ทำให้ห้องหลุดจาก "รอตอบ" (denorm lastSenderRole)', () => {
  it('ข้อความร้านปกติ/บอทเขียน SHOP · AUTO_NOTICE ไม่เขียน', () => {
    expect(shopSendSenderRolePatch(null)).toEqual({ lastSenderRole: 'SHOP' })
    expect(shopSendSenderRolePatch(undefined)).toEqual({ lastSenderRole: 'SHOP' })
    expect(shopSendSenderRolePatch('AUTO')).toEqual({ lastSenderRole: 'SHOP' })
    expect(shopSendSenderRolePatch('AUTO_TEST')).toEqual({ lastSenderRole: 'SHOP' })
    expect(shopSendSenderRolePatch('AUTO_NOTICE')).toEqual({})
  })

  it('ทางส่งออกนอก (channel-chat Meta/LINE + chat-outbox) ใช้ helper ทุกจุด ไม่เขียน lastSenderRole: \'SHOP\' ตรง ๆ', () => {
    for (const f of ['src/services/channel-chat.service.ts', 'src/services/chat-outbox.service.ts']) {
      const s = readFileSync(join(process.cwd(), f), 'utf8')
      expect(s, f).not.toMatch(/lastMessagePreview:\s*preview,\s*lastSenderRole:\s*'SHOP'/)
      expect(s, f).toContain('shopSendSenderRolePatch(params.autoReplyKind)')
    }
  })
})

describe('ผู้ซื้อมีข้อความใหม่จากร้าน — ไม่พึ่ง lastSenderRole', () => {
  const T = (min: number) => new Date(Date.UTC(2026, 9, 17, 10, min)).toISOString()
  it('ข้อความร้าน (รวม AUTO_NOTICE) ใหม่กว่าเวลาอ่าน → ขึ้นจุด แม้ lastSenderRole ยัง BUYER', () => {
    expect(buyerHasUnreadFromShop({ lastShopMessageAt: T(5), buyerLastReadAt: T(2), lastSenderRole: 'BUYER' })).toBe(true)
    expect(buyerHasUnreadFromShop({ lastShopMessageAt: T(5), buyerLastReadAt: null, lastSenderRole: 'BUYER' })).toBe(true)
  })
  it('อ่านแล้ว / ไม่เคยมีข้อความร้าน → ไม่ขึ้น', () => {
    expect(buyerHasUnreadFromShop({ lastShopMessageAt: T(5), buyerLastReadAt: T(6) })).toBe(false)
    expect(buyerHasUnreadFromShop({ lastShopMessageAt: null, buyerLastReadAt: null, lastSenderRole: 'BUYER' })).toBe(false)
  })
  it('payload เก่าไม่มี lastShopMessageAt → นิยามเดิมทุกประการ', () => {
    expect(buyerHasUnreadFromShop({ buyerLastReadAt: null, lastSenderRole: 'SHOP', lastMessageAt: T(5) })).toBe(true)
    expect(buyerHasUnreadFromShop({ buyerLastReadAt: T(6), lastSenderRole: 'SHOP', lastMessageAt: T(5) })).toBe(false)
    expect(buyerHasUnreadFromShop({ buyerLastReadAt: null, lastSenderRole: 'BUYER', lastMessageAt: T(5) })).toBe(false)
  })
  it('3 จอผู้ซื้อใช้ helper ไม่ตัดสินเอง', () => {
    for (const f of ['src/components/chat/BuyerChatWidget.tsx', 'src/app/(marketing)/(buyer-app)/messages/page.tsx', 'src/app/(marketing)/m/messages/MessagesInbox.tsx']) {
      const s = readFileSync(join(process.cwd(), f), 'utf8')
      expect(s, f).toContain('buyerHasUnreadFromShop(')
      expect(s, f).not.toMatch(/lastSenderRole === 'SHOP' &&/)
    }
  })
})

describe('static (TC-103/104)', () => {
  const files = walk(join(process.cwd(), 'src'))

  it('TC-103: ไม่มี autoReplyKind: { not: null } (ตีความ "ไม่ null = บอท") — allow-list ว่าง', () => {
    const hits = files.filter((f) => /autoReplyKind:\s*\{\s*not:\s*null/.test(readFileSync(f, 'utf8')))
    expect(hits).toEqual([])
  })

  it('TC-103: AUTO_REPLY_KINDS ประกาศที่เดียว (auto-reply-constants.ts)', () => {
    const defs = files.filter((f) => /(const|type)\s+AUTO_REPLY_KINDS\s*=/.test(readFileSync(f, 'utf8')))
    expect(defs.map((f) => f.split('src/')[1])).toEqual(['lib/auto-reply-constants.ts'])
  })

  it('โหมด system ของ sendMessage ห้ามถูกเรียกจาก route ใต้ src/app/api (client ปลอมข้ามสิทธิ์ผู้ใช้ไม่ได้)', () => {
    const offends = (src: string) => /\bsendMessage\s*\(/.test(src) && /\bsystem\s*:/.test(src)
    // พิสูจน์ว่าตัวตรวจจับได้จริง: ตัวอย่างที่ผิดต้องถูกจับ
    expect(offends("await sendMessage({ conversationId, senderUserId: null, system: { shopId, autoReplyKind: 'AUTO_NOTICE' } })")).toBe(true)
    expect(offends('await sendMessage({ conversationId, senderUserId: userId, senderRole })')).toBe(false)
    const apiFiles = files.filter((f) => f.includes('/src/app/api/'))
    expect(apiFiles.length).toBeGreaterThan(50) // กันสแกนว่างแล้วเขียวหลอก
    expect(apiFiles.filter((f) => offends(readFileSync(f, 'utf8')))).toEqual([])
  })

  it('TC-104: บับเบิล — ลำดับป้าย DeepBot/AUTO_TEST → ระบบ → AI ของ Meta · span+title+sr-only ไม่ใช่ปุ่ม', () => {
    const f = files.find((x) => x.endsWith('inbox/[conversationId]/components/ThreadMessageList.tsx'))!
    const s = readFileSync(f, 'utf8')
    const iBot = s.indexOf('<AutoReplyTag')
    const iSys = s.indexOf('t.autoNotify.sentBySystem')
    const iMeta = s.indexOf('t.inbox.metaAiBadgeExplain')
    expect(iBot).toBeGreaterThan(-1)
    expect(iBot).toBeLessThan(iSys)
    expect(iSys).toBeLessThan(iMeta)
    const block = s.slice(iBot, iMeta)
    expect(block).toMatch(/<span\s+title=\{noticeLabel\}/)
    expect(block).toContain('<span className="sr-only">{noticeLabel}</span>')
    expect(block).not.toMatch(/<button[^>]*sentBySystem/)
  })
})
