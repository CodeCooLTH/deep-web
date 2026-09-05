import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'

/**
 * sendOrderToChat — ส่งการ์ดออเดอร์เข้าเธรดแชทให้ลูกค้าเห็น
 *
 * 🛑 สกัดออกมาเป็นฟังก์ชันร่วมโดยตั้งใจ (00061 BR-ACO-27) — มี **2 ที่** ที่กดปุ่มนี้ได้:
 * การ์ดออเดอร์ในแผงขวา (`CustomerPanel`) และการ์ดผลลัพธ์ในเธรด (00061)
 * ถ้าก็อป fetch+confirm ไปไว้ทั้งสองที่ คำใน Swal กับ endpoint จะ drift กันเงียบ ๆ (HR16) —
 * และคำถามยืนยันคือสิ่งเดียวที่กันไม่ให้ลูกค้าได้รับสรุปที่ร้านยังไม่ตั้งใจส่ง
 *
 * @param noun คำเรียกของสิ่งนั้นตามประเภทกิจการ (`resolveOrderVocab().noun`) — ร้านบริการ/
 *   บ้านพักไม่เรียกรายการของตัวเองว่า "คำสั่งซื้อ" และกล่องนี้เด้งทับจอที่ใช้คำอีกแบบอยู่
 * @returns `true` เมื่อส่งสำเร็จจริง · `false` ทั้งกรณียกเลิกและกรณีส่งไม่สำเร็จ
 *   (ผู้เรียกไม่ควรแยกสองอย่างนี้ — ทั้งคู่แปลว่า "ลูกค้ายังไม่ได้รับ")
 */
export async function sendOrderToChat(params: {
  conversationId: string
  orderToken: string
  noun: string
}): Promise<boolean> {
  const { conversationId, orderToken, noun } = params
  const ok = await pacesConfirm.question(
    `ส่ง${noun}นี้เข้าแชท?`,
    `ลูกค้าจะได้รับข้อมูล${noun}นี้ในแชท`,
    { confirmButtonText: 'ส่งเลย' },
  )
  if (!ok) return false

  try {
    // ส่ง type=ORDER เสมอ — route ตัดสินตามช่องทาง: DEEP ลูกค้าเห็นการ์ด · Messenger/IG ได้ลิงก์
    // แต่ "ร้าน" เห็นเป็นการ์ดทั้งสองกรณี
    const res = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'ORDER', orderRefToken: orderToken }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      pacesToast.error(d?.error ?? 'ส่งไม่สำเร็จ ลองใหม่อีกครั้ง')
      return false
    }
    pacesToast.success('ส่งเข้าแชทแล้ว')
    return true
  } catch {
    pacesToast.error('ส่งไม่สำเร็จ ลองใหม่อีกครั้ง')
    return false
  }
}
