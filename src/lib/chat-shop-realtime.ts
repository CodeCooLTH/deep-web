'use client'

/**
 * chat-shop-realtime — subscription ร่วม (refcounted singleton) ของ channel `chat:shop:{shopId}`
 *
 * ทำไมต้องมีไฟล์นี้แทนที่จะ subscribe ตรงใน component: หน้าแชทมี InboxList **2 instance พร้อมกัน
 * เสมอ** (ChatRail ของ (chat)/layout.tsx + list ใน inbox/page.tsx) — ทั้งคู่ mount จริงทุก
 * breakpoint ซ่อนกันด้วย CSS (`hidden lg:flex` / `lg:hidden`) ไม่ใช่ conditional render
 * ถ้าต่างคนต่าง `supabase.channel('chat:shop:X').subscribe()` = join topic เดิมซ้ำบน socket เดียว
 * (Phoenix ตอบ error, channel ตัวหลังตายเงียบ) — จึงต้องแชร์ channel เดียวแล้ว fan-out ให้ listener
 *
 * payload = signal-only (มีแค่ conversationId ตาม migration
 * prisma/migrations/20260703000400_chat_realtime_broadcast/migration.sql) — listener ต้อง refetch
 * ผ่าน authenticated GET เสมอ ห้ามเชื่อ/ใช้เนื้อหาจาก broadcast
 *
 * หมายเหตุ: trigger ส่ง `new_message` เฉพาะข้อความ senderRole='BUYER' เท่านั้น (ข้อความที่ร้าน
 * ตอบเอง รวมถึง echo จาก Messenger app ไม่เข้า channel นี้) — caller จึงควรมี focus/visibility
 * fallback ควบคู่เสมอ ดู InboxList.tsx
 */
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'

/**
 * signal ที่ trigger ส่งมา — มีแค่ conversationId (ห้ามมีเนื้อข้อความ ดู migration)
 * listener เดิมที่ไม่รับ argument ยังใช้ได้เหมือนเดิม; ตัวที่ต้องรู้ว่า "ห้องไหน" (เช่นเช็ค mute
 * รายเธรดก่อนเล่นเสียง) ค่อยอ่านจากตรงนี้ — ยังห้ามใช้ทำอย่างอื่นนอกจากเป็น key ต้อง refetch เสมอ
 */
type ChatSignal = { conversationId?: string }
type Listener = (signal: ChatSignal) => void

/**
 * `new_message` = ลูกค้าทักมา (ค่าตั้งต้น — listener เดิมทุกตัว: toast/เสียง/ตัวนับ)
 * `shop_reply` = ร้านตอบ (00077 โต๊ะแชท · migration 20261016230000) — ห้ามให้ toast/เสียงฟังตัวนี้
 */
export type ShopChatEvent = 'new_message' | 'shop_reply'
const SHOP_CHAT_EVENTS: ShopChatEvent[] = ['new_message', 'shop_reply']

// เก็บเป็น record ต่อการ subscribe (ไม่ใช้ fn เป็นคีย์) — fn ตัวเดียวกันฟังหลาย event ได้โดยไม่ทับกัน
type Sub = { fn: Listener; event: ShopChatEvent }
const subscriptions = new Map<string, { channel: RealtimeChannel; listeners: Set<Sub> }>()

/** subscribe สัญญาณของร้านนี้ (ค่าตั้งต้น = ข้อความใหม่จากผู้ซื้อ) — คืน unsubscribe (ปิด channel จริงเมื่อ listener หมด) */
export function subscribeShopChat(shopId: string, listener: Listener, event: ShopChatEvent = 'new_message'): () => void {
  let entry = subscriptions.get(shopId)

  if (!entry) {
    const listeners = new Set<Sub>()
    let channel = getSupabaseBrowserClient().channel(`chat:shop:${shopId}`)
    // ลงทะเบียนทุก event ครั้งเดียวก่อน subscribe (channel แชร์กัน — .on หลัง subscribe ไม่มีผล)
    for (const ev of SHOP_CHAT_EVENTS) {
      channel = channel.on('broadcast', { event: ev }, (msg) => {
        const raw = (msg as { payload?: { conversationId?: unknown } } | undefined)?.payload
        const conversationId = typeof raw?.conversationId === 'string' ? raw.conversationId : undefined
        listeners.forEach((sub) => { if (sub.event === ev) sub.fn({ conversationId }) })
      })
    }
    channel.subscribe()
    entry = { channel, listeners }
    subscriptions.set(shopId, entry)
  }

  const sub: Sub = { fn: listener, event }
  entry.listeners.add(sub)

  return () => {
    const current = subscriptions.get(shopId)
    if (!current) return
    current.listeners.delete(sub)
    if (current.listeners.size === 0) {
      getSupabaseBrowserClient().removeChannel(current.channel)
      subscriptions.delete(shopId)
    }
  }
}
