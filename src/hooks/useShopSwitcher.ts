'use client'

/**
 * useShopSwitcher — logic กลางของการสลับร้าน (ใช้ร่วม 3 จุด: UserDropdownDetailed,
 * AccountSwitcherSheet, SwitchShopButton) แทนที่ handleSwitch เดิมที่ก็อปมาซ้ำกัน 3 ที่
 *
 * เปลี่ยนพฤติกรรมจากเดิม (router.refresh()) เป็น: โชว์ full-screen overlay อย่างน้อย 3000ms
 * แล้ว hard-navigate ไปหน้า dashboard เสมอ (window.location.href) — บังคับทุกหน้าโหลดข้อมูล
 * server ใหม่ทั้งหมด แก้ปัญหาข้อมูลไม่รีเฟรชหลังสลับร้าน
 *
 * Base logic: src/layouts/components/TopBar/components/UserDropdownDetailed.tsx handleSwitch (เดิม)
 */

import { pacesToast } from '@/lib/paces-toast'
import { useSession } from 'next-auth/react'
import { useCallback, useRef, useState } from 'react'

const MIN_OVERLAY_MS = 3000

// path ที่ sidebar/menu ของ seller ใช้ลิงก์ไป dashboard จริง (_seller-menu.ts, SellerBottomNav.tsx ฯลฯ)
// — ไม่ใช่ '/seller/dashboard' เพราะ subdomain routing (proxy.ts) rewrite ให้แล้ว
const DASHBOARD_PATH = '/dashboard'

export interface ShopSwitchTarget {
  name?: string
  kind?: 'personal' | 'business'
  logo?: string | null
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export function useShopSwitcher() {
  const { update } = useSession()
  const [switching, setSwitching] = useState(false)
  const [target, setTarget] = useState<ShopSwitchTarget | undefined>(undefined)
  // ref กันดับเบิลคลิกยิงซ้ำระหว่างที่ setSwitching(true) ยังไม่ re-render
  const switchingRef = useRef(false)

  const switchShop = useCallback(
    async (shopId: string, targetInfo?: ShopSwitchTarget) => {
      if (switchingRef.current) return
      switchingRef.current = true
      setSwitching(true)
      setTarget(targetInfo)

      const startedAt = Date.now()

      try {
        const res = await fetch('/api/business/switch-context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shopId }),
        })
        if (res.status === 403) {
          pacesToast.error('ไม่มีสิทธิ์เข้าถึงบัญชีนี้แล้ว')
          switchingRef.current = false
          setSwitching(false)
          return
        }
        if (!res.ok) {
          pacesToast.error('สลับบัญชีไม่สำเร็จ กรุณาลองใหม่')
          switchingRef.current = false
          setSwitching(false)
          return
        }
        // jwt callback จะ re-verify membership อีกชั้นก่อนเชื่อค่านี้จริง (API.md §4.15, 2-layer verify)
        await update({ activeShopId: shopId })
      } catch {
        pacesToast.error('สลับบัญชีไม่สำเร็จ กรุณาลองใหม่')
        switchingRef.current = false
        setSwitching(false)
        return
      }

      // สำเร็จ — บังคับ overlay ค้างรวมอย่างน้อย 3000ms (นับจากโชว์ overlay) กันกระพริบเร็วเกินไป
      // แล้วให้เวลา session propagate ก่อนหน้า dashboard เริ่ม fetch
      const elapsed = Date.now() - startedAt
      const remaining = MIN_OVERLAY_MS - elapsed
      if (remaining > 0) await sleep(remaining)

      // hard-navigate เสมอ (ไม่ใช่ router.refresh) — บังคับ server data ทุกหน้า re-render ใหม่หมด
      // ไม่ setSwitching(false) ตรงนี้ — ปล่อย overlay ค้างจน browser unload หน้านี้จริง
      window.location.href = DASHBOARD_PATH
    },
    [update],
  )

  return { switching, target, switchShop }
}
