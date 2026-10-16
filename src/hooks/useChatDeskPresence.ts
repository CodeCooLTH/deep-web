'use client'

/**
 * useChatDeskPresence — อ่านรายชื่อคีย์ที่ออนไลน์ของร้านหนึ่ง สำหรับหน้าโต๊ะแชท (00077)
 * อ่านอย่างเดียว: ไม่ลงชื่อเอง (BR-CD-22) · ล่ม/ไม่ sync ใน 10 วินาที → status 'unavailable' (UI แสดง "—")
 * ผู้เรียกจับคู่คีย์กับ members[].presenceKey เอง — ใช้ `state.status`/`state.keys` เป็น deps ไม่ใช่ตัว state ทั้งก้อน
 */
import { useEffect, useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { createPresenceReader, type PresenceClientLike, type PresenceReaderState } from '@/lib/chat-desk/presence-controller'

const INITIAL: PresenceReaderState = { status: 'connecting', keys: [] }
const UNAVAILABLE: PresenceReaderState = { status: 'unavailable', keys: [] }

export function useChatDeskPresence(shopId: string | null): PresenceReaderState {
  // จำว่าสถานะเป็นของร้านไหน — สลับร้านแล้วสถานะร้านเก่าต้องไม่ค้างมาแสดง (ไม่ต้อง setState ใน effect เพื่อรีเซ็ต)
  const [held, setHeld] = useState<{ shopId: string; state: PresenceReaderState } | null>(null)

  useEffect(() => {
    if (!shopId) return
    const put = (state: PresenceReaderState) => setHeld({ shopId, state })
    let client: PresenceClientLike
    try {
      client = getSupabaseBrowserClient() as unknown as PresenceClientLike
    } catch {
      const t = setTimeout(() => put(UNAVAILABLE), 0)
      return () => clearTimeout(t)
    }
    const reader = createPresenceReader({ client, shopId, onChange: put })
    reader.start()
    return () => reader.stop()
  }, [shopId])

  return shopId && held?.shopId === shopId ? held.state : INITIAL
}
