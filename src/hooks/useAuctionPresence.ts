'use client'

/**
 * useAuctionPresence — นับผู้ชม auction ที่กำลังดูพร้อมกัน (feature 00006, live viewer count)
 *
 * ใช้ Supabase Realtime **Presence API** บน channel **แยก** `presence:auction:{id}`
 * — ไม่แตะ broadcast-from-DB channel `auction:{id}` เดิม (feature 00002 §2.4 security: reservePrice/
 *   expectedPrice leak guard) เพราะ presence เป็นคนละ protocol (ไม่ผ่าน DB trigger, ไม่มี write)
 *
 * - enabled=false (auction ไม่ live) → ไม่ subscribe, คืน 0 (FR-VIEW-03)
 * - presence key = unique ต่อ tab (guest-safe, ไม่ผูก login) → multi-tab นับซ้ำ (known-limitation FR-VIEW-01-AC-05)
 * - fail-safe: presence ล่ม = count ค้าง/0 แต่ไม่ throw (ไม่กระทบหน้า/placeBid/settle)
 */

import { useEffect, useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'

export function useAuctionPresence(auctionId: string, enabled: boolean): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setCount(0)
      return
    }
    const supabase = getSupabaseBrowserClient()
    const channel = supabase.channel(`presence:auction:${auctionId}`, {
      // key ต่อ tab (นับแต่ละ tab เป็น 1 viewer) — ephemeral, ไม่ผูก userId
      config: { presence: { key: `${Date.now()}-${Math.random().toString(36).slice(2)}` } },
    })

    const sync = () => setCount(Object.keys(channel.presenceState()).length)

    channel
      .on('presence', { event: 'sync' }, sync)
      .on('presence', { event: 'join' }, sync)
      .on('presence', { event: 'leave' }, sync)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') channel.track({ at: Date.now() })
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [auctionId, enabled])

  return count
}
