'use client'

/**
 * ChatSoundListener — เสียงเตือนข้อความใหม่ สำหรับหน้าในกล่องข้อความที่ "ไม่มี InboxList"
 *
 * ปัญหา (user report 2026-08-04): เจ้าของเสียงเตือนคือ InboxList (ดู comment ใน ChatThread.tsx
 * ที่ตั้ง beepEnabled=false ไว้กันเสียงเบิ้ล) แต่พออยู่แท็บ "ความคิดเห็น" ChatRailColumn คืน null
 * ทั้งคอลัมน์ → InboxList ไม่ถูก mount เลย → มีข้อความใหม่เข้ามาก็เงียบสนิท ทั้งที่ยังอยู่ในกล่อง
 * ข้อความอยู่แท้ ๆ user: "อยู่ tab ความคิดเห็นแล้วมีข้อความใหม่ ก็ต้องมีเสียงเหมือนกัน"
 *
 * ทำไมไม่ต้อง refetch ก่อนเล่นเหมือน InboxList: trigger ฝั่ง DB ส่ง `new_message` **เฉพาะ
 * senderRole='BUYER'** อยู่แล้ว (ดูหัวไฟล์ chat-shop-realtime.ts + migration
 * 20260703000400_chat_realtime_broadcast) — สัญญาณที่มาถึงจึงแปลว่า "ลูกค้าทักมา" เสมอ
 * ไม่มีเคสที่ต้องกรองว่าเป็นข้อความที่ร้านเพิ่งส่งเอง ซึ่งเป็นเหตุผลเดียวที่ InboxList ต้องเทียบ state
 *
 * เสียงซ้ำกับ InboxList ไม่เกิด เพราะ playChatBeep throttle รายร้าน (และข้ามแท็บผ่าน
 * BroadcastChannel) อยู่แล้ว — ต่อให้ทั้งคู่ mount พร้อมกันก็ดังครั้งเดียว
 */
import { useEffect } from 'react'
import { subscribeShopChat } from '@/lib/chat-shop-realtime'
import { playChatBeep } from '@/lib/chat-sound'

export default function ChatSoundListener({ shopIds }: { shopIds: string[] }) {
  useEffect(() => {
    if (shopIds.length === 0) return
    // ส่ง conversationId ต่อไปด้วย เพื่อให้การ "ปิดเสียงเฉพาะเธรดนี้" ยังมีผลเหมือนตอนอยู่หน้า
    // รายการ ไม่ใช่ว่าพอสลับมาแท็บความคิดเห็นแล้วเธรดที่ปิดเสียงไว้กลับมาดัง
    // feature 00037 — เสียงต้องดังจากทุกร้านในขอบเขต ไม่ใช่แค่ร้าน active (ในโหมดรวม ผู้ใช้
    // กำลังเฝ้าทุกร้านพร้อมกัน) shopId ที่ส่งเข้า playChatBeep ใช้เป็น throttle key รายร้าน
    const offs = shopIds.map((shopId) =>
      subscribeShopChat(shopId, ({ conversationId }) => playChatBeep({ shopId, conversationId })),
    )
    return () => offs.forEach((off) => off())
    // key เป็น string — array prop สร้างใหม่ทุก render ของ parent จะทำให้ effect วิ่งซ้ำไม่จบ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopIds.join(',')])

  return null
}
