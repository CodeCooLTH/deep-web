'use client'

import { useChatPresenceTracker } from '@/hooks/useChatPresenceTracker'

/** ลงชื่อออนไลน์ให้โต๊ะแชท (00077) — ไม่มี UI · ใส่ key={scopeKey} ที่ layout เพื่อลงชื่อใหม่เมื่อขอบเขตร้านเปลี่ยน */
export default function ChatPresenceTracker() {
  useChatPresenceTracker()
  return null
}
