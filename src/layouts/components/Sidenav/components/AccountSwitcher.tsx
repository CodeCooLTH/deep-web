/**
 * AccountSwitcher — sidebar dropdown สลับบัญชี Personal ⇄ Business (feat 00008 TFR-012, FR-BIZ-14/15)
 *
 * Base: src/layouts/components/Sidenav/components/UserProfileSettings.tsx (hs-dropdown block ทั้งชุด
 *   — id/aria pattern, `hs-dropdown-menu`, `.dropdown-item`/`.dropdown-divider`, header "ยินดีต้อนรับ")
 *   ซึ่งเอง Base มาจาก theme/paces/Admin/TS/src/layouts/components/Sidenav/components/UserProfileSettings.tsx
 * + Base: src/layouts/components/TopBar/components/UserDropdownDetailed.tsx (role/tier badge
 *   `badge bg-{color}/15 text-{color}` pattern ใน dropdown header)
 *   ซึ่ง Base มาจาก theme/paces/Admin/TS/src/layouts/components/TopBar/components/UserDropdownDetailed.tsx
 *
 * Design Spec: docs/superpowers/specs/2026-07-02-00008-business-ui-design-spec.md §2
 *
 * ทำไม hs-dropdown ตรง ๆ (ไม่ใช่ custom React state แบบ FilterDropdown): Sidenav mount ครั้งเดียว
 * ต่อ page load ไม่ re-render ถี่เหมือน toolbar filter → ไม่ชน bug Preline inline-state ค้าง
 * opacity 0 (บทเรียน OrderCardMenu 2026-06-15 — ปัญหานั้นเกิดกับ component ที่ re-render บ่อยเท่านั้น)
 *
 * ●/○ = typographic dingbat radio-indicator (HR12 no-emoji carve-out — มี precedent ใน
 * AuctionBidFeed.tsx "● สด" อยู่แล้ว), ไม่ใช่ emoji
 */
'use client'

import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'

interface BusinessContextItem {
  shopId: string
  shopName: string
  role: 'OWNER' | 'ADMIN'
  locked: boolean
  lockReason: string | null
  deletedAt: string | null
}

interface BusinessContextResponse {
  personal: { shopId: string; shopName: string } | null
  businesses: BusinessContextItem[]
}

interface AccountSwitcherProps {
  /** จาก session.user.hasBusinessMembership (คำนวณที่ lib/auth.ts session callback แล้ว
   *  thread ผ่าน DashboardLayout → VerticalLayout → Sidenav) — false = ไม่เคยเป็นสมาชิก
   *  business ไหนเลย → ซ่อนสมบูรณ์ (ไม่ใช่ disabled/CSS hide) */
  hasBusinessMembership: boolean
}

const AccountSwitcher = ({ hasBusinessMembership }: AccountSwitcherProps) => {
  const { data: session, update } = useSession()
  const router = useRouter()
  const [context, setContext] = useState<BusinessContextResponse | null>(null)
  const [switching, setSwitching] = useState(false)

  const activeShopId = (session as any)?.user?.activeShopId as string | null | undefined

  useEffect(() => {
    // guard: fetch เฉพาะเมื่อมี business membership จริง (กันยิง request เปล่าให้ทุก seller)
    if (!hasBusinessMembership) return
    let cancelled = false
    fetch('/api/business/context')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setContext({ personal: data.personal, businesses: data.businesses ?? [] })
      })
      .catch(() => {
        /* เงียบ — switcher เป็น progressive enhancement ไม่บล็อก UI หลักของ sidebar */
      })
    return () => {
      cancelled = true
    }
  }, [hasBusinessMembership])

  // ต้องอยู่หลัง hook ทั้งหมดเสมอ (Rules of Hooks) — return null = ซ่อนสมบูรณ์ตาม Design Spec §2
  if (!hasBusinessMembership) return null

  const handleSwitch = async (shopId: string, locked: boolean) => {
    if (switching || shopId === activeShopId) return
    if (locked) {
      pacesToast.error('บัญชีนี้ถูกล็อกชั่วคราว — ไม่สามารถสลับเข้าใช้งานได้')
      return
    }
    setSwitching(true)
    try {
      const res = await fetch('/api/business/switch-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopId }),
      })
      if (res.status === 403) {
        pacesToast.error('ไม่มีสิทธิ์เข้าถึงบัญชีนี้แล้ว')
        return
      }
      if (!res.ok) {
        pacesToast.error('สลับบัญชีไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      // jwt callback จะ re-verify membership อีกชั้นก่อนเชื่อค่านี้จริง (API.md §4.15, 2-layer verify)
      await update({ activeShopId: shopId })
      router.refresh()
    } catch {
      pacesToast.error('สลับบัญชีไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setSwitching(false)
    }
  }

  const activeBusiness = context?.businesses.find((b) => b.shopId === activeShopId)
  const activeLabel = activeBusiness?.shopName ?? context?.personal?.shopName ?? 'บัญชีของฉัน'

  return (
    <div className="px-5 pb-3">
      <div className="hs-dropdown relative inline-flex w-full [--placement:bottom-left]">
        <button
          type="button"
          className="btn btn-sm bg-default-100 hover:bg-default-200 flex w-full items-center justify-between gap-2 text-start"
          aria-haspopup="menu"
          aria-expanded="false"
          aria-label="สลับบัญชี"
        >
          <span className="truncate text-xs font-semibold">{activeLabel}</span>
          <Icon icon="chevron-down" className="size-4 shrink-0" aria-hidden="true" />
        </button>
        <div
          className="hs-dropdown-menu w-64"
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="hs-dropdown-account-switcher"
        >
          <div className="px-3.5 py-2">
            <h6 className="text-xs">บัญชีของคุณ</h6>
          </div>

          {/* Personal */}
          {context?.personal && (
            <button
              type="button"
              role="menuitem"
              onClick={() => handleSwitch(context.personal!.shopId, false)}
              className="dropdown-item w-full text-start"
            >
              <span className="me-1 align-middle" aria-hidden="true">
                {activeShopId === context.personal.shopId ? '●' : '○'}
              </span>
              <span className="align-middle truncate">{context.personal.shopName}</span>
              <span className="badge bg-default-100 text-default-500 ms-auto shrink-0">ส่วนตัว</span>
            </button>
          )}

          {/* Business list */}
          {context?.businesses.map((b) => (
            <button
              key={b.shopId}
              type="button"
              role="menuitem"
              onClick={() => handleSwitch(b.shopId, b.locked)}
              disabled={switching}
              className="dropdown-item w-full text-start disabled:opacity-50"
            >
              <span className="me-1 align-middle" aria-hidden="true">
                {activeShopId === b.shopId ? '●' : '○'}
              </span>
              <span className="align-middle truncate">{b.shopName}</span>
              <span
                className={`badge ms-auto shrink-0 ${
                  b.role === 'OWNER' ? 'bg-primary/15 text-primary' : 'bg-info/15 text-info'
                }`}
              >
                {b.role === 'OWNER' ? 'เจ้าของ' : 'ผู้ดูแล'}
              </span>
              {b.locked && (
                <span className="badge bg-danger/15 text-danger ms-1 inline-flex shrink-0 items-center gap-0.5">
                  <Icon icon="lock" className="size-3" aria-hidden="true" />
                </span>
              )}
            </button>
          ))}

          <div className="dropdown-divider"></div>
          <Link href="/business" className="dropdown-item">
            <Icon icon="building-store" className="me-1 align-middle text-lg" aria-hidden="true" />
            <span className="align-middle">จัดการแพ็กเกจธุรกิจ</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default AccountSwitcher
