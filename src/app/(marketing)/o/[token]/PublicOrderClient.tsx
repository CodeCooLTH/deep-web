'use client'

/**
 * Orchestrator สำหรับ /o/[token] — จัดการ 2 stages:
 * 1. 'lock'   — PhoneUnlock (ต้องกรอกเบอร์ตรงกับ order)
 * 2. 'detail' — OrderDetailMobile (mobile-first + fixed bottom CTA)
 *
 * Unlock persists via sessionStorage (key scoped per token) — reload หน้าเดิม
 * ภายใน session เดียวไม่ต้อง unlock ใหม่
 *
 * T13 (Phase 4 B5 — rework): ลบ ?unlocked=1 query trust ออกทั้งหมด
 * Security fix: query param = client-trusted = auth bypass → ใครก็ได้ต่อ ?unlocked=1
 * แทนด้วย server-decided props (initialUnlocked / smsUnlocked) จาก parent RSC
 * ที่ verify HMAC signed cookie แล้วก่อนส่งลงมา
 *
 * UUID flow ที่ไม่มี cookie ทำงานเหมือนเดิมเป๊ะ (regression safe):
 * - initialUnlocked=false → stage='lock' → PhoneUnlock → sessionStorage persist
 */
import { useEffect, useState } from 'react'

import { toast } from 'react-toastify'

import OrderDetailMobile, { type PublicOrderData } from './OrderDetailMobile'
import PhoneUnlock from './PhoneUnlock'

type Stage = 'lock' | 'detail'

type Props = {
  order: PublicOrderData
  /** server-decided: true = SMS code ผ่าน HMAC verify แล้ว → ข้าม PhoneUnlock */
  initialUnlocked?: boolean
  /** server-decided: true = SMS flow → handleConfirm ไม่ต้องส่ง contact (RC-8) */
  smsUnlocked?: boolean
}

const unlockStorageKey = (token: string) => `deep-o-unlock-${token.slice(0, 8)}`

export default function PublicOrderClient({
  order,
  initialUnlocked,
  smsUnlocked,
}: Props) {
  const [stage, setStage] = useState<Stage>('lock')
  const [phone, setPhone] = useState('')
  const [orderState, setOrderState] = useState(order)

  // ลอง restore unlock จาก initialUnlocked (server-decided) หรือ sessionStorage (UUID flow)
  useEffect(() => {
    if (typeof window === 'undefined') return

    // SMS flow: server verify HMAC cookie แล้ว → ข้าม PhoneUnlock ทันที
    // ไม่ set phone เพราะ SMS flow ไม่รู้ phone ฝั่ง client (RC-8: client ไม่ควรรู้)
    // unlockedPhone='' ที่ส่งไป OrderDetailMobile จะ suppress "เบอร์ · ..." footer
    if (initialUnlocked) {
      setStage('detail')
      return
    }

    // UUID flow เดิม: restore จาก sessionStorage
    const saved = sessionStorage.getItem(unlockStorageKey(order.publicToken))
    if (saved && /^0[0-9]{9}$/.test(saved)) {
      setPhone(saved)
      setStage('detail')
    }
  }, [order.publicToken, initialUnlocked])

  const handleUnlock = async (enteredPhone: string) => {
    const res = await fetch(`/api/orders/${order.publicToken}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: enteredPhone }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data?.error ?? 'เบอร์นี้ไม่ตรงกับคำสั่งซื้อ')
    }
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(unlockStorageKey(order.publicToken), enteredPhone)
    }
    setPhone(enteredPhone)
    setStage('detail')
  }

  // handleCancel — buyer ขอยกเลิก order (PENDING เท่านั้น)
  // ส่ง contact = phone (เบอร์ที่ buyer unlock ไว้) ตาม schema ของ cancel route
  // SMS flow ที่ phone='' จะไม่ถูกเรียก (canCancel guard ด้านล่างป้องกัน)
  const handleCancel = async () => {
    const res = await fetch(`/api/orders/${orderState.publicToken}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact: phone }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (res.status === 403) {
        throw new Error('ไม่สามารถยกเลิกได้ กรุณาติดต่อผู้ขาย')
      }
      throw new Error(data.error ?? 'ยกเลิกไม่สำเร็จ')
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
    // SMS flow (smsUnlocked): server รู้ phone จาก cookie+order.buyerContact แล้ว
    // ส่ง smsUnlock:true เพื่อให้ route handler รู้ว่าใช้ cookie-verified path
    // ห้ามส่ง phone/contact ใน body (RC-8: client ไม่ควรรู้/ส่ง phone)
    //
    // UUID flow (ไม่ใช่ smsUnlocked): ส่ง contact ตามปกติ (PhoneUnlock flow เดิม)
    const body = smsUnlocked ? { smsUnlock: true } : { contact: phone }

    const res = await fetch(`/api/orders/${order.publicToken}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data?.error ?? 'ยืนยันไม่สำเร็จ')
    }
    toast.success('ยืนยันคำสั่งซื้อแล้ว ขอบคุณครับ')
    // Optimistic update → re-render detail with new status (status จาก response)
    setOrderState((prev) => ({ ...prev, status: data.status ?? 'CONFIRMED' }))
  }

  if (stage === 'lock') {
    return (
      <PhoneUnlock
        orderHint={`#${order.publicToken.slice(0, 8)}`}
        onUnlock={handleUnlock}
        // ส่ง shop preview เพื่อแสดง Trust Strip ก่อน buyer กรอกเบอร์ (FR-UX-1 anti-scam)
        // field path ตรงกับ PublicOrderData: order.shop.user.{trustScore,username}, order.maxVerifyLevel
        shop={{
          shopName: order.shop.shopName,
          trustScore: order.shop.user.trustScore,
          maxVerifyLevel: order.maxVerifyLevel,
          username: order.shop.user.username,
        }}
      />
    )
  }

  // canCancel: ส่ง onCancel เฉพาะเมื่อ PENDING และ (ไม่ใช่ SMS flow หรือรู้ phone แล้ว)
  // SMS flow ที่ phone='' จะยกเลิกผ่าน buyer path ไม่ได้ (route ต้องการ contact)
  const canCancel = orderState.status === 'PENDING' && (!smsUnlocked || !!phone)

  return (
    <OrderDetailMobile
      order={orderState}
      unlockedPhone={phone}
      onConfirmAction={handleConfirm}
      onCancel={canCancel ? handleCancel : undefined}
    />
  )
}
