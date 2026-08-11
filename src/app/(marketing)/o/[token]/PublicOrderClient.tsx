'use client'

/**
 * Orchestrator สำหรับ /o/[token] — feature 00015 (Order Claim & Forced Login) simplify
 *
 * ทำไม (TD-004 + SDS §3): force-login gate ย้ายความรับผิดชอบ "ยืนยันตัวตน" ไปที่ page.tsx
 * (server, resolveOrderAccess) ทั้งหมดแล้ว — ทุกคนที่มาถึง component นี้คือ session ที่ผ่าน
 * grant decision (OWNER_MATCH/PHONE_MATCH_AUTO_CLAIM) มาแล้ว จึงไม่มี stage 'lock'
 * /PhoneUnlock/AccountPromptCard อีกต่อไป — เหลือแค่ render OrderDetailMobile
 *
 * confirm/cancel: ไม่ส่ง contact/smsUnlock ใน body อีกต่อไป — server ตรวจ session+ownership เอง
 * (slip upload ย้าย logic ไปอยู่ที่ OrderDetailMobile.tsx โดยตรงแล้ว เพราะไม่ต้องพึ่ง phone อีก)
 *
 * Base: ไฟล์นี้เป็น client orchestrator ล้วน (ไม่มี JSX ของตัวเอง — render แค่ OrderDetailMobile.tsx
 * ซึ่งอ้าง Base ของตัวเองแล้ว)
 */
import { useState } from 'react'

import { toast } from 'react-toastify'

import OrderDetailMobile, { type PublicOrderData } from './OrderDetailMobile'

type Props = {
  order: PublicOrderData
}

export default function PublicOrderClient({ order }: Props) {
  const [orderState, setOrderState] = useState(order)

  // handleCancel — buyer ขอยกเลิก order (PENDING เท่านั้น) — session+ownership ตรวจที่ server
  const handleCancel = async () => {
    const res = await fetch(`/api/orders/${orderState.publicToken}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (res.status === 403) {
        throw new Error('ไม่สามารถยกเลิกได้ กรุณาติดต่อผู้ขาย')
      }
      throw new Error(data.error ?? 'ยกเลิกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    }
    toast.success('ยกเลิกคำสั่งซื้อแล้ว')
    // Optimistic update — รวม cancelInitiator จาก response เพื่อให้ copy "คุณ/ร้านค้ายกเลิก" ถูกต้องทันที (ไม่ต้อง reload)
    setOrderState((prev) => ({
      ...prev,
      status: 'CANCELLED',
      cancelInitiator: (data.cancelInitiator as 'seller' | 'buyer' | null) ?? prev.cancelInitiator,
    }))
  }

  const handleConfirm = async () => {
    const res = await fetch(`/api/orders/${order.publicToken}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data?.error ?? 'ยืนยันไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    }
    // 🛑 บอก "ผลที่เกิดขึ้นจริง" ไม่ใช่คำขอบคุณลอย ๆ — นาทีนี้คือตอนที่คนแปลกหน้ากลายเป็น
    // คู่ค้าที่ยืนยันแล้ว และประวัติของร้านได้หลักฐานเพิ่มหนึ่งชิ้นซึ่งร้านเขียนเองไม่ได้
    // (คือสิ่งเดียวที่ Deep มีไว้ทำ) ของเดิมเขียน "ขอบคุณครับ" ซึ่งนอกจากไม่บอกอะไรแล้ว
    // ยังเป็นคำลงท้ายที่ระบุเพศของผู้พูด ทั้งที่คนพูดคือระบบ
    toast.success('ยืนยันรับสินค้าแล้ว — บันทึกลงประวัติของร้านเรียบร้อย')
    // Optimistic update → re-render detail with new status (status จาก response)
    setOrderState((prev) => ({ ...prev, status: data.status ?? 'CONFIRMED' }))
  }

  // canCancel: PENDING เท่านั้น (parent — ownership ตรวจแล้วที่ server ก่อน render component นี้)
  const canCancel = orderState.status === 'PENDING'

  return (
    <OrderDetailMobile
      order={orderState}
      onConfirmAction={handleConfirm}
      onCancel={canCancel ? handleCancel : undefined}
    />
  )
}
