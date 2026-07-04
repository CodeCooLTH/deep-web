'use client'

/**
 * Base: theme/paces/Admin/TS/src/components/AppLogo.tsx (Paces logo-box; โครง logo-lg/logo-sm)
 *   — src/components/AppLogo.tsx = SafePay fork ที่ swap asset เป็นโลโก้ Deep (ใช้เป็น fallback ตัวเดิม)
 *
 * business active → โลโก้ร้าน + ชื่อร้าน; ไม่งั้น → โลโก้ Deep เดิม (<AppLogo/>)
 * 🛑 ต้อง emit ทั้ง .logo-lg และ .logo-sm — _sidenav.css toggle การแสดงผลด้วย CSS ล้วน
 *    (condensed/on-hover: ซ่อน .logo-lg โชว์ .logo-sm). ถ้ามีแค่ .logo-lg → sidebar ยุบจะว่างเปล่า
 */

import AppLogo from '@/components/AppLogo'
import Icon from '@/components/wrappers/Icon'
import { useSession } from 'next-auth/react'

const SidebarBrand = () => {
  const { data: session } = useSession()
  const user = (session as any)?.user as
    | { activeShopKind?: 'PERSONAL' | 'BUSINESS'; activeShopName?: string | null; activeShopLogo?: string | null }
    | undefined

  if (user?.activeShopKind !== 'BUSINESS') return <AppLogo />

  const logo = user.activeShopLogo
  const name = user.activeShopName ?? 'ร้านค้า'

  const logoCircle = (
    <span className="size-7 rounded-lg bg-primary/15 text-primary inline-flex items-center justify-center shrink-0">
      <Icon icon="building-store" className="size-4" />
    </span>
  )

  return (
    <>
      {/* logo-lg: sidebar เต็มความกว้าง */}
      <span className="logo-lg flex items-center gap-2 min-w-0">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="size-7 rounded-lg object-cover shrink-0" />
        ) : (
          logoCircle
        )}
        <span className="text-default-800 truncate text-sm font-bold">{name}</span>
      </span>

      {/* logo-sm: sidebar ยุบ (condensed/on-hover) — icon-only, CSS โชว์อัตโนมัติ */}
      <span className="logo-sm hidden items-center justify-center">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="size-7 rounded-lg object-cover" />
        ) : (
          logoCircle
        )}
      </span>
    </>
  )
}

export default SidebarBrand
