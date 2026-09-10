'use client'

/**
 * IapRecoveryListener — รับธุรกรรมที่ StoreKit ส่งกลับมาเอง แล้วเปิดสิทธิ์ให้ (feature 00064)
 *
 * Base mount pattern: `ChatToastListener.tsx` (client component เปล่า mount ที่ dashboard
 * layout ไม่มี UI ของตัวเอง — คืน null เสมอ)
 *
 * ## ทำไมต้อง mount ที่ layout ไม่ใช่ที่หน้าเลือกแพ็กเกจ
 *
 * คนที่จ่ายเงินแล้วสิทธิ์ไม่เปิด **ไม่รู้ว่าต้องกลับไปหน้าแพ็กเกจ** เขาจะไปเปิดหน้าที่เขาอยากใช้
 * แล้วเจอว่าใช้ไม่ได้ ⇒ ถ้าแขวนไว้เฉพาะหน้าแพ็กเกจ การกู้คืนจะเกิดก็ต่อเมื่อผู้ใช้บังเอิญ
 * เดินกลับไปที่นั่นเอง ซึ่งคือเงื่อนไขเดียวกับที่ทำให้ปุ่ม "กู้คืนการซื้อ" ไม่ช่วยอะไร
 *
 * ## 🛑 ทำงานเงียบเมื่อไม่สำเร็จ
 *
 * ผู้ใช้ไม่ได้สั่งอะไร และส่วนใหญ่ไม่ได้กำลังคิดเรื่องแพ็กเกจอยู่เลย ⇒ ล้มแล้วเงียบ
 * ปล่อยให้ StoreKit ส่งกลับมาใหม่รอบหน้า · บอกเฉพาะตอนสิทธิ์เปลี่ยนจริง (`shouldAnnounceRecovery`)
 *
 * ## 🛑 บนเบราว์เซอร์ปกติไม่แขวนอะไรเลย
 *
 * `subscribeIapRecovered` คืน `null` เมื่อไม่มี `ReactNativeWebView` ⇒ ผู้ใช้เว็บไม่ได้จ่าย
 * ค่า listener กับ state ใด ๆ ของฟีเจอร์ที่ใช้ไม่ได้กับเขา
 */
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

import { pacesToast } from '@/lib/paces-toast'
import type { IapPurchase } from '@/lib/iap-bridge-protocol'
import { createIapClient } from '@/lib/iap-client'
import { createWindowIapTransport, subscribeIapRecovered } from '@/lib/iap-transport'
import { recoverPurchases, shouldAnnounceRecovery } from '@/lib/iap-recovery'
import type { VerifyResponse } from '@/lib/iap-verify-outcome'

export default function IapRecoveryListener() {
  const router = useRouter()
  /* กันงานซ้อน: StoreKit ยิงได้หลายใบติด ๆ กัน ถ้าปล่อยให้รอบใหม่เริ่มก่อนรอบเก่าจบ
     จะได้คำขอยืนยันใบเดียวกันสองครั้งพร้อมกัน */
  const runningRef = useRef(false)

  useEffect(() => {
    const win = typeof window === 'undefined' ? undefined : window
    const client = createIapClient(createWindowIapTransport(win))

    const verify = async (item: IapPurchase): Promise<VerifyResponse> => {
      try {
        const res = await fetch('/api/iap/apple/verify', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signedTransaction: item.jws }),
        })
        return { status: res.status }
      } catch {
        return 'NETWORK_ERROR'
      }
    }

    const unsubscribe = subscribeIapRecovered(win, (items) => {
      if (runningRef.current) return
      runningRef.current = true
      void recoverPurchases(items, { verify, finish: client.finish })
        .then((report) => {
          if (!shouldAnnounceRecovery(report)) return
          pacesToast.success('เปิดใช้งานแพ็กเกจแล้ว')
          router.refresh()
        })
        .catch(() => {
          /* เงียบโดยตั้งใจ — ดูหัวไฟล์ */
        })
        .finally(() => {
          runningRef.current = false
        })
    })

    return () => unsubscribe?.()
  }, [router])

  return null
}
