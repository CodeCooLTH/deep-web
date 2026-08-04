'use client'

/**
 * comment-realtime — subscription ร่วมของ channel `comments:shop:{shopId}` (feature 00029)
 *
 * โครงเดียวกับ lib/chat-shop-realtime.ts (refcounted singleton): ถ้าต่างคนต่าง
 * `supabase.channel('comments:shop:X').subscribe()` = join topic เดิมซ้ำบน socket เดียว
 * ซึ่ง Supabase จะตัดตัวก่อนหน้าทิ้ง — คนที่ subscribe ก่อนจะเงียบไปเฉย ๆ โดยไม่มี error
 *
 * payload เป็น **signal-only** (มีแค่ postId — ดู migration 20260803180000) listener ต้อง refetch
 * ผ่าน authenticated GET เสมอ ห้ามเชื่อ/ใช้เนื้อหาจาก broadcast
 */
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'

type Listener = () => void

const subscriptions = new Map<string, { channel: RealtimeChannel; listeners: Set<Listener> }>()

/** subscribe คอมเมนต์ใหม่/ถูกแก้ของร้านนี้ — คืน unsubscribe (ปิด channel จริงเมื่อ listener หมด) */
export function subscribeShopComments(shopId: string, listener: Listener): () => void {
  let entry = subscriptions.get(shopId)

  if (!entry) {
    const listeners = new Set<Listener>()
    const channel = getSupabaseBrowserClient()
      .channel(`comments:shop:${shopId}`)
      .on('broadcast', { event: 'new_comment' }, () => {
        listeners.forEach((l) => l())
      })
      .subscribe()
    entry = { channel, listeners }
    subscriptions.set(shopId, entry)
  }

  entry.listeners.add(listener)

  return () => {
    const current = subscriptions.get(shopId)
    if (!current) return
    current.listeners.delete(listener)
    if (current.listeners.size === 0) {
      getSupabaseBrowserClient().removeChannel(current.channel)
      subscriptions.delete(shopId)
    }
  }
}
