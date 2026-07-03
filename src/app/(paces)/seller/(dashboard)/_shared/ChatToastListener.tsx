'use client'

/**
 * ChatToastListener — S-7 (feat 00011 Deep Chat)
 *
 * subscribe Supabase Realtime channel `chat:shop:{shopId}` (broadcast จาก DB trigger —
 * prisma/migrations/20260703000400_chat_realtime_broadcast/migration.sql) แล้วเด้ง
 * pacesToast.chat.info เมื่อผู้ซื้อส่งข้อความใหม่มา แม้ seller ไม่ได้เปิดหน้า /inbox/[conversationId]
 * อยู่ตอนนั้น (SDS §3.4/§3.5, TFR-CHAT-11)
 *
 * Base mount pattern: TopUpCelebrationPoller.tsx (client component เปล่า mount ที่ dashboard
 * layout, ไม่มี UI ของตัวเอง — คืน null เสมอ)
 * Base realtime subscribe pattern: src/app/(marketing)/a/[id]/AuctionDetailClient.tsx:144-179
 * (Supabase channel .on('broadcast', ...).subscribe() + cleanup removeChannel)
 *
 * dedup (UX-Design-Spec.md S3): เทียบ conversationId จาก broadcast payload กับ pathname ปัจจุบัน —
 * ถ้า seller เปิดอยู่ที่ thread นั้นแล้ว (/inbox/{conversationId}) ไม่ toast ซ้ำ (thread เองมี realtime
 * subscribe + mark-read ของตัวเองอยู่แล้ว — ดู ChatThread.tsx)
 *
 * payload มีแค่ conversationId (signal-only ตาม migration comment — ห้ามมี body/imageUrl หลุดผ่าน
 * broadcast) ใช้ id นี้เทียบ pathname เท่านั้น ไม่ใช่ trust เนื้อหาอะไรที่ sensitive
 *
 * guard: ไม่มี shopId (ยังไม่มีร้าน ระหว่าง auto-create ใน layout) → ไม่ subscribe
 * disconnect = เงียบ — unread badge (S-13) มาจาก DB เสมอ ไม่พึ่ง realtime
 */
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { pacesToast } from '@/lib/paces-toast'

type Props = {
  shopId: string | null
}

export default function ChatToastListener({ shopId }: Props) {
  const pathname = usePathname()
  // ref เก็บ pathname ล่าสุด — ให้ broadcast handler (closure ผูกตอน subscribe ครั้งเดียว)
  // อ่านค่าปัจจุบันได้โดยไม่ต้อง resubscribe channel ทุกครั้งที่ path เปลี่ยน
  const pathnameRef = useRef(pathname)
  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  useEffect(() => {
    if (!shopId) return

    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel(`chat:shop:${shopId}`)
      .on(
        'broadcast',
        { event: 'new_message' },
        (message: { payload?: { conversationId?: string } }) => {
          const conversationId = message.payload?.conversationId
          if (conversationId && pathnameRef.current === `/inbox/${conversationId}`) return
          pacesToast.chat.info('คุณมีข้อความใหม่เข้ามา')
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [shopId])

  return null
}
