'use client'

// Base: src/app/(marketing)/auth/sign-in/OAuthErrorToast.tsx
// feature 00015 (Order Claim & Forced Login) TD-003: SMS-code consume ล้มเหลว (expired/used/mismatch)
// → redirect มา sign-in เปล่าพร้อม ?smsExpired=1 แทน hard-error /o/link-invalid — คอมโพเนนต์นี้แจ้ง
// buyer ว่าเกิดอะไรขึ้น (Controller resolution Q3: toast.warning — เป็น soft fallback ไม่ใช่ความล้มเหลว)
import { useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { toast } from 'react-toastify'

export default function SmsExpiredToast() {
  const params = useSearchParams()
  const smsExpired = params.get('smsExpired')

  useEffect(() => {
    if (smsExpired !== '1') return
    // ลิงก์ SMS ใช้ได้ครั้งเดียว (2026-10-04) — สาเหตุที่พบบ่อยตอนนี้คือ "ใช้ไปแล้ว" ไม่ใช่แค่หมดอายุ
    toast.warning('ลิงก์นี้ใช้ไปแล้วหรือหมดอายุ เข้าสู่ระบบด้วยเบอร์โทรเพื่อดูคำสั่งซื้อต่อ')
  }, [smsExpired])

  return null
}
