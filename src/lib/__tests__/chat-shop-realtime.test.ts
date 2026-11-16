/**
 * chat-shop-realtime — fan-out ตาม event บน channel เดียว (00077 ext: shop_reply)
 * กันถอยหลัง: listener เดิม (toast/เสียง) ต้องไม่ถูกปลุกด้วย shop_reply · fn เดียวฟังสอง event ได้
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

type Handler = (msg: { payload?: { conversationId?: string } }) => void
const handlers = new Map<string, Handler>()
const removeChannel = vi.fn()
const subscribe = vi.fn()
const channelFactory = vi.fn()

vi.mock('@/lib/supabase-browser', () => ({
  getSupabaseBrowserClient: () => ({
    channel: (name: string) => {
      channelFactory(name)
      const ch = {
        on: (_t: string, f: { event: string }, h: Handler) => { handlers.set(f.event, h); return ch },
        subscribe: () => { subscribe(); return ch },
      }
      return ch
    },
    removeChannel,
  }),
}))

const fire = (event: string, conversationId = 'c1') => handlers.get(event)?.({ payload: { conversationId } })

describe('subscribeShopChat — แยก event', () => {
  beforeEach(() => { handlers.clear(); vi.clearAllMocks(); vi.resetModules() })

  it('ค่าตั้งต้น = new_message เท่านั้น — shop_reply ไม่ปลุก listener เดิม', async () => {
    const { subscribeShopChat } = await import('@/lib/chat-shop-realtime')
    const toast = vi.fn()
    const off = subscribeShopChat('s1', toast)
    fire('shop_reply'); expect(toast).not.toHaveBeenCalled()
    fire('new_message', 'c9'); expect(toast).toHaveBeenCalledWith({ conversationId: 'c9' })
    off()
  })

  it('fn เดียวฟังสอง event ได้ และ unsubscribe แยกกัน · channel เดียวต่อร้าน · ปิดเมื่อหมด listener', async () => {
    const { subscribeShopChat } = await import('@/lib/chat-shop-realtime')
    const fn = vi.fn()
    const offIn = subscribeShopChat('s1', fn)
    const offReply = subscribeShopChat('s1', fn, 'shop_reply')
    expect(channelFactory).toHaveBeenCalledTimes(1)
    expect(subscribe).toHaveBeenCalledTimes(1)
    fire('new_message'); fire('shop_reply'); expect(fn).toHaveBeenCalledTimes(2)
    offIn(); fire('new_message'); fire('shop_reply'); expect(fn).toHaveBeenCalledTimes(3)
    expect(removeChannel).not.toHaveBeenCalled()
    offReply(); expect(removeChannel).toHaveBeenCalledTimes(1)
  })
})

describe('migration shop_reply — กรงเล็บ', () => {
  const sql = readFileSync('prisma/migrations/20261016230000_chat_shop_reply_broadcast/migration.sql', 'utf8')
  const code = sql.replace(/--.*$/gm, '')
  it('payload signal-only (ไม่มี body/imageUrl) และไม่ยิงบรรทัดระบบ', () => {
    expect(code).not.toMatch(/"body"|"imageUrl"|NEW\.body/)
    expect(code).toMatch(/NOT IN \('AUTO_ORDER_RESULT', 'META_NOTICE'\)/)
    expect(code).toMatch(/TG_OP = 'INSERT' AND/)
  })
  // ตัวรายการบรรทัดระบบล่าสุดอยู่ที่ migration ของ 00095 (ทับฟังก์ชันเดียวกัน) — ตรวจที่ตัวล่าสุด
  it('บรรทัดระบบในเงื่อนไขตรงกับ INTERNAL_MESSAGE_TYPES (ฟังก์ชันฉบับล่าสุด)', async () => {
    const { INTERNAL_MESSAGE_TYPES } = await import('@/lib/auto-order-message-type')
    const latest = readFileSync('prisma/migrations/20261117100100_00095_follow_bot_note_realtime/migration.sql', 'utf8').replace(/--.*$/gm, '')
    expect(latest).not.toMatch(/"body"|"imageUrl"|NEW\.body/)
    expect(latest).toMatch(/TG_OP = 'INSERT' AND/)
    for (const t of INTERNAL_MESSAGE_TYPES) expect(latest).toContain(`'${t}'`)
  })
})
