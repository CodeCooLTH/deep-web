'use client'

/**
 * useChatPresenceTracker — ลงชื่อ "ออนไลน์" ในทุกร้านของขอบเขตแชท (00077 · BR-CD-19..21)
 * mount ที่ layout (chat) เท่านั้น · key ทึบออกโดย server (`/api/chat/presence-keys`) ไม่ใช่ userId
 * fail-safe: ขอคีย์ไม่ได้/Supabase ไม่พร้อม = เงียบ ไม่กระทบหน้าแชท
 */
import { useEffect } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { createPresenceTracker, type PresenceClientLike, type PresenceKeyEntry } from '@/lib/chat-desk/presence-controller'

export function useChatPresenceTracker(): void {
  useEffect(() => {
    const ac = new AbortController()
    let stop: (() => void) | null = null
    let onVisible: (() => void) | null = null

    ;(async () => {
      try {
        const res = await fetch('/api/chat/presence-keys', { cache: 'no-store', signal: ac.signal })
        if (!res.ok) return
        const { keys } = (await res.json()) as { keys: PresenceKeyEntry[] }
        if (ac.signal.aborted || !Array.isArray(keys) || keys.length === 0) return
        const tracker = createPresenceTracker({ client: getSupabaseBrowserClient() as unknown as PresenceClientLike, keys })
        tracker.start()
        onVisible = () => {
          if (document.visibilityState === 'visible') tracker.retrack()
        }
        document.addEventListener('visibilitychange', onVisible)
        stop = () => tracker.stop()
      } catch {
        /* ยกเลิก/เครือข่ายล้ม/ไม่มี env — ไม่ทำอะไร */
      }
    })()

    return () => {
      ac.abort()
      if (onVisible) document.removeEventListener('visibilitychange', onVisible)
      stop?.()
    }
  }, [])
}
