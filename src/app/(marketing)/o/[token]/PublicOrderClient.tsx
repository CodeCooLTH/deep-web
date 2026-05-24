'use client'

/**
 * Orchestrator สำหรับ /o/[token] — จัดการ 2 stages:
 * 1. 'lock'   — PhoneUnlock OTP multi-step (T4+T5 rewrite)
 * 2. 'detail' — OrderDetailMobile (mobile-first + fixed bottom CTA)
 *
 * Unlock flow ใหม่ (T4+T5, S-3, S-4, S-5, S-7, S-9):
 *   PhoneUnlock → OTP → signIn('phone-otp') → onSignedIn → router.refresh()
 *   → RSC page.tsx re-eval session → ส่ง sessionUnlockedPhone → detail
 * ไม่มี sessionStorage lock persist สำหรับ OTP path (session cookie ทำหน้าที่แทน)
 *
 * T13 (Phase 4 B5 — rework): ลบ ?unlocked=1 query trust ออกทั้งหมด
 * Security fix: query param = client-trusted = auth bypass → ใครก็ได้ต่อ ?unlocked=1
 * แทนด้วย server-decided props (initialUnlocked / smsUnlocked) จาก parent RSC
 * ที่ verify HMAC signed cookie แล้วก่อนส่งลงมา
 *
 * UUID flow ที่ไม่มี cookie ทำงานเหมือนเดิมเป๊ะ (regression safe):
 * - initialUnlocked=false → stage='lock' → PhoneUnlock OTP → router.refresh()
 *
 * NOTE: handleUnlock (old phone-match POST /api/orders/[token]/unlock) ถูกลบออก
 * เพราะ OTP path ใช้ signIn แทน lock/unlock route ไม่ได้ถูกลบ (ยังอยู่ที่ /api/orders/[token]/unlock)
 * แค่หยุดเรียกจาก client นี้ตาม task spec
 */
import { useEffect, useState } from 'react'

import { useRouter } from 'next/navigation'

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
  /**
   * T3: logged-in user เบอร์ตรงกับ order.buyerContact (server-resolved) → ข้าม lock screen
   * ทันที + ใช้เบอร์นี้ใน confirm/cancel. mismatch ถูกบล็อกที่ server (page.tsx) แล้ว
   * จึงไม่ต้องมี blockedByMismatch prop ที่นี่ (กัน order PII เข้า RSC flight)
   */
  sessionUnlockedPhone?: string
}

export default function PublicOrderClient({
  order,
  initialUnlocked,
  smsUnlocked,
  sessionUnlockedPhone,
}: Props) {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('lock')
  const [phone, setPhone] = useState('')
  const [orderState, setOrderState] = useState(order)

  // ลอง restore unlock จาก initialUnlocked (server-decided) หรือ sessionUnlockedPhone (session path)
  useEffect(() => {
    if (typeof window === 'undefined') return

    // logged-in user เบอร์ตรง order (server-resolved) → ข้าม lock + ใช้เบอร์ใน confirm/cancel (S-9)
    if (sessionUnlockedPhone) {
      setPhone(sessionUnlockedPhone)
      setStage('detail')
      return
    }

    // SMS flow: server verify HMAC cookie แล้ว → ข้าม PhoneUnlock ทันที
    // ไม่ set phone เพราะ SMS flow ไม่รู้ phone ฝั่ง client (RC-8: client ไม่ควรรู้)
    // unlockedPhone='' ที่ส่งไป OrderDetailMobile จะ suppress "เบอร์ · ..." footer
    if (initialUnlocked) {
      setStage('detail')
      return
    }

    // OTP path: ไม่มี sessionStorage restore — session cookie จาก signIn เป็น gate
    // หลัง router.refresh() page.tsx จะ re-eval session + ส่ง sessionUnlockedPhone กลับมา
    // ทำให้ useEffect นี้วิ่งอีกครั้งกับ sessionUnlockedPhone ที่มีค่า → detail
  }, [order.publicToken, initialUnlocked, sessionUnlockedPhone])

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
    // session/OTP flow: ส่ง contact ตามปกติ (phone มาจาก sessionUnlockedPhone)
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
        // onSignedIn: เรียก router.refresh() → RSC page.tsx re-eval session → ส่ง sessionUnlockedPhone
        // → useEffect detect → setStage('detail') (retro #25 pattern: refresh ไม่ใช่ setStage ตรง)
        onSignedIn={() => router.refresh()}
        // ส่ง shop preview เพื่อแสดง Trust Strip ก่อน buyer กรอกเบอร์ (FR-UX-1 anti-scam)
        // field path ตรงกับ PublicOrderData: order.shop.user.{trustScore,username}, order.maxVerifyLevel
        shop={{
          shopName: order.shop.shopName,
          trustScore: order.shop.user.trustScore,
          maxVerifyLevel: order.maxVerifyLevel,
          username: order.shop.user.username,
          // avatar สำหรับ V1 header ของ lock screen (field มีจาก data layer Phase 2 V1)
          avatar: order.shop.user.avatar,
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
