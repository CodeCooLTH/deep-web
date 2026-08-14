'use client'

/**
 * useShopSwitcher — logic กลางของการสลับร้าน (ใช้ร่วม 3 จุด: UserDropdownDetailed,
 * AccountSwitcherSheet, SwitchShopButton) แทนที่ handleSwitch เดิมที่ก็อปมาซ้ำกัน 3 ที่
 *
 * เปลี่ยนพฤติกรรมจากเดิม (router.refresh()) เป็น: โชว์ full-screen overlay อย่างน้อย 3000ms
 * แล้ว hard-navigate (window.location.href) — บังคับทุกหน้าโหลดข้อมูล server ใหม่ทั้งหมด
 * แก้ปัญหาข้อมูลไม่รีเฟรชหลังสลับร้าน
 *
 * ปลายทางเริ่มต้น = /dashboard (topbar/mobile-sheet/subscriptions ใช้ค่านี้) — caller ที่อยาก
 * ให้กลับหน้าเดิมของตัวเอง (เช่น chat header อยากอยู่ที่ /inbox ให้แชทของร้านใหม่โหลดตาม) ส่ง
 * landingPath ผ่าน option ได้ (feat chat shop-switcher 2026-07-30)
 *
 * Base logic: src/layouts/components/TopBar/components/UserDropdownDetailed.tsx handleSwitch (เดิม)
 */

import { pacesToast } from '@/lib/paces-toast'
import { useT } from '@/i18n/LocaleProvider'
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

interface UseShopSwitcherOptions {
  // ปลายทาง hard-navigate หลังสลับสำเร็จ (default /dashboard) — chat ส่ง '/inbox'
  landingPath?: string
  /**
   * เวลาขั้นต่ำที่ overlay ต้องค้าง (default 3000) — ตั้งสั้นลงได้เมื่อ "ผู้ใช้ไม่ได้ตั้งใจสลับร้าน"
   *
   * 3000 เดิมมีไว้กันจอกระพริบตอนผู้ใช้ "กดสลับร้านเอง" — เขาเพิ่งเลือกร้านจากรายการ ต้องเห็น
   * ว่ากำลังไปร้านไหนสักพักก่อนจอเปลี่ยน ไม่งั้นเหมือนกดพลาด
   *
   * แต่เส้นทางที่สลับให้อัตโนมัติ (กด notification ของอีกร้าน) ตรงข้ามกันเลย — ผู้ใช้ตั้งใจจะ
   * "อ่านข้อความ" การถ่วง 3 วินาทีทำให้รู้สึกว่าระบบช้า ทั้งที่งานจริงจบตั้งแต่ ~0.3 วินาที
   * (POST switch-context + session.update) ที่เหลือคือนั่งรอเปล่า ๆ
   *
   * ปลอดภัยที่จะสั้น: session.update() เป็น await — cookie ถูกตั้งเรียบร้อยแล้วตอน promise คืนค่า
   * เวลาที่เกินจากนั้นเป็นเรื่อง "ความรู้สึก" ไม่ใช่ความถูกต้อง
   */
  minOverlayMs?: number
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export function useShopSwitcher(options?: UseShopSwitcherOptions) {
  const t = useT()
  const landingPath = options?.landingPath ?? DASHBOARD_PATH
  const minOverlayMs = options?.minOverlayMs ?? MIN_OVERLAY_MS
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
          pacesToast.error(t.accountSwitcher.noAccessError)
          switchingRef.current = false
          setSwitching(false)
          return
        }
        if (!res.ok) {
          pacesToast.error(t.accountSwitcher.switchError)
          switchingRef.current = false
          setSwitching(false)
          return
        }
        // jwt callback จะ re-verify membership อีกชั้นก่อนเชื่อค่านี้จริง (API.md §4.15, 2-layer verify)
        await update({ activeShopId: shopId })
      } catch {
        pacesToast.error(t.accountSwitcher.switchError)
        switchingRef.current = false
        setSwitching(false)
        return
      }

      // สำเร็จ — บังคับ overlay ค้างรวมอย่างน้อย 3000ms (นับจากโชว์ overlay) กันกระพริบเร็วเกินไป
      // แล้วให้เวลา session propagate ก่อนหน้า dashboard เริ่ม fetch
      const elapsed = Date.now() - startedAt
      const remaining = minOverlayMs - elapsed
      if (remaining > 0) await sleep(remaining)

      // hard-navigate เสมอ (ไม่ใช่ router.refresh) — บังคับ server data ทุกหน้า re-render ใหม่หมด
      // ไม่ setSwitching(false) ตรงนี้ — ปล่อย overlay ค้างจน browser unload หน้านี้จริง
      window.location.href = landingPath
    },
    // `t` เป็นค่าคงที่ระดับ module ต่อภาษา (LocaleProvider คืน dictionary ไม่ใช่ object literal)
    // identity จึงเสถียร ใส่ dep ได้โดยไม่เกิดลูป (docs/conventions/hook-return-identity-in-deps.md)
    [update, landingPath, minOverlayMs, t],
  )

  return { switching, target, switchShop }
}
