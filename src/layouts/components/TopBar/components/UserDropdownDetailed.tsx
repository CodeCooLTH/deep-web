'use client'

import AccountAvatar from '@/components/AccountAvatar'
import ShopSwitchOverlay from '@/components/paces/ShopSwitchOverlay'
import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'
import { signOut, useSession } from 'next-auth/react'
import { Fragment, useEffect, useState } from 'react'
import { resolveBuyerBaseUrl } from '@/lib/buyer-url'
import { pacesToast } from '@/lib/paces-toast'
import { useT } from '@/i18n/LocaleProvider'
import type { Dictionary } from '@/i18n/dictionaries/th'
import { useShopSwitcher } from '@/hooks/useShopSwitcher'
import { useCreatePersonalShop } from '@/hooks/useCreatePersonalShop'

type UserProfileMenuType = {
  label: string
  icon: string
  link: string
  divider?: boolean
  className?: string
  action?: 'sign-out'
}

// สลับ context Personal ⇄ Business — feat 00008 P4-6 (ย้ายจาก sidebar AccountSwitcher เข้ามาที่นี่)
interface BusinessContextItem {
  shopId: string
  shopName: string
  logo: string | null
  role: 'OWNER' | 'ADMIN'
  locked: boolean
  lockReason: string | null
  deletedAt: string | null
}

interface BusinessContextResponse {
  /** เปิดจากในแอป iOS → ห้ามมีทางเข้าหน้าซื้อ (Guideline 3.1.1) — server เป็นคนตัดสิน */
  hidePayments?: boolean
  personal: { shopId: string; shopName: string } | null
  businesses: BusinessContextItem[]
}

// เหลือเฉพาะ sign-out — ตัด บัญชีของฉัน/การแจ้งเตือน/ตั้งค่าบัญชี/ช่วยเหลือ
// ที่ลิงก์ไป /my-account (404) หรือ '#' ออก จนกว่าจะมี route จริง (consistent กับ UserProfileSettings)
// 🛑 ต้องเป็นฟังก์ชันรับ dictionary ห้ามเป็นค่าคงที่ระดับ module (feature 00047)
// array ที่ประกาศนอก component ถูกประเมินครั้งเดียวตอน import ก่อน React เรนเดอร์ ⇒ ข้อความจะผูก
// กับภาษาที่โหลดตอน bundle แล้วค้างอยู่อย่างนั้นตลอดไปไม่ว่าผู้ใช้เลือกอะไร (กับดักเดียวกับ
// callbackStatusMessage ใน ChannelsClient.tsx — เจอมาแล้ว 3 ครั้งในฟีเจอร์นี้)
const buildUserProfileMenu = (t: Dictionary): UserProfileMenuType[] => [
  { label: t.common.signOut, icon: 'logout', link: '#', action: 'sign-out', className: 'font-semibold' },
]

const UserDropdown = () => {
  const t = useT()
  const { data: session } = useSession()
  const user = (session as any)?.user as
    | {
        id: string
        displayName: string
        username: string
        email: string | null
        avatar: string | null
        isShop?: boolean
        // feat 00008 — คำนวณแล้วใน lib/auth.ts session callback
        hasBusinessMembership?: boolean
        activeShopId?: string | null
        activeShopRole?: 'OWNER' | 'ADMIN'
        activeShopKind?: 'PERSONAL' | 'BUSINESS'
        activeShopName?: string | null
        activeShopLogo?: string | null
        activeShopSlug?: string | null
      }
    | undefined

  const userProfileMenuData = buildUserProfileMenu(t)

  const displayName = user?.displayName ?? user?.username ?? t.accountSwitcher.fallbackUser

  const hasBusinessMembership = user?.hasBusinessMembership === true
  const activeShopId = user?.activeShopId

  // identity ที่โชว์ (topbar button + active box) — business active → ร้าน, ไม่งั้น personal
  const isBusiness = user?.activeShopKind === 'BUSINESS'
  const activeName = isBusiness ? (user?.activeShopName ?? t.menu.shop) : displayName
  const activeLogo = isBusiness ? (user?.activeShopLogo ?? null) : (user?.avatar ?? null)
  const activeRoleLabel = isBusiness
    ? user?.activeShopRole === 'ADMIN'
      ? t.accountSwitcher.roleAdmin
      : t.accountSwitcher.roleOwner
    : t.accountSwitcher.rolePersonal

  const [context, setContext] = useState<BusinessContextResponse | null>(null)
  const { switching, target, switchShop } = useShopSwitcher()
  // feature 00026 — ผู้ถูกเชิญที่ยังไม่มีร้านส่วนตัว (context.personal === null) กดสร้างได้จากที่นี่
  const { creating, createPersonalShop } = useCreatePersonalShop()

  // 2026-08-04: เลิก guard ด้วย hasBusinessMembership — บล็อก "บัญชีทั้งหมด" แสดงเสมอแล้ว
  // จึงต้องรู้ทุกกรณีว่ามีร้านส่วนตัวหรือยัง (ไม่งั้นคนที่มีแต่ร้านส่วนตัวจะเห็นหัวข้อว่างเปล่า
  // และผู้ถูกเชิญที่ยังไม่มีร้านส่วนตัวจะไม่ได้ปุ่มสร้าง)
  const [contextFailed, setContextFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    // no-store + cache-buster query: กัน cache ทุกชั้น serve response เก่า (ร้านใหม่ไม่โผล่)
    fetch(`/api/business/context?_t=${Date.now()}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return
        if (data) setContext({ personal: data.personal, businesses: data.businesses ?? [] })
        else setContextFailed(true)
      })
      .catch(() => {
        // เดิมเงียบสนิทได้เพราะบล็อกถูกซ่อนอยู่แล้วเมื่อไม่มี business — ตอนนี้บล็อกโชว์เสมอ
        // ความว่างเปล่าจึงอ่านเหมือนบั๊ก ต้องบอกให้ชัดว่าโหลดไม่สำเร็จ (ดู fallback ด้านล่าง)
        if (!cancelled) setContextFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSwitch = (
    shopId: string,
    locked: boolean,
    targetInfo: { name: string; kind: 'personal' | 'business'; logo: string | null },
  ) => {
    if (switching || shopId === activeShopId) return
    if (locked) {
      pacesToast.error(t.accountSwitcher.lockedError)
      return
    }
    switchShop(shopId, targetInfo)
  }

  const handleItemClick = (e: React.MouseEvent<HTMLAnchorElement>, item: UserProfileMenuType) => {
    if (item.action === 'sign-out') {
      e.preventDefault()
      signOut({ callbackUrl: '/auth/sign-in' })
    }
  }

  return (
    <>
    <div className="topbar-item hs-dropdown before:bg-default-700/35 relative inline-flex before:h-4.5 before:w-px before:content-['']">
      <button className="hs-dropdown-toggle topbar-link ms-2.5 cursor-pointer items-center px-3! flex" aria-haspopup="menu" aria-expanded="false" aria-label="Dropdown">
        <AccountAvatar src={activeLogo} kind={isBusiness ? 'business' : 'personal'} className="size-8 lg:me-3" />
        <div className="hidden lg:flex items-center gap-1.5">
          <span className="flex flex-col items-start">
            <h5 className="pro-username">{activeName}</h5>
            <span className="text-xs/none mb-0.5">{activeRoleLabel}</span>
          </span>
          <Icon icon="chevron-down" className="align-middle" />
        </div>
      </button>
      <div className="hs-dropdown-menu min-w-72 p-2" role="menu" aria-orientation="vertical" aria-labelledby="hs-dropdown-with-icons">
        {/* active account — กล่องไฮไลต์บนสุด (แทนกล่องน้ำเงิน FB ด้วย border-primary; ตัด tier/trust ออก) */}
        <div className="border border-primary bg-primary/5 rounded-lg flex items-center gap-3 px-3 py-2.5">
          <AccountAvatar src={activeLogo} kind={isBusiness ? 'business' : 'personal'} className="size-9" />
          <div className="min-w-0">
            <p className="text-body-color truncate text-sm font-semibold">{activeName}</p>
            <p className="text-default-400 truncate text-xs">{activeRoleLabel}</p>
          </div>
        </div>

        {/* บัญชีทั้งหมด — แสดงเสมอ (user เคาะ 2026-08-04). เดิมทั้งบล็อกถูกซ่อนเมื่อไม่มี business
            membership ซึ่งทำให้คนที่มีแต่ร้านส่วนตัวไม่มีทางเปิดธุรกิจจากที่นี่เลย
            list ไม่รวมบัญชีที่ active — มันอยู่ในกล่องไฮไลต์ด้านบนแล้ว */}
        <>
            <div className="px-2 pt-3 pb-1">
              <span className="text-default-400 text-xs">{t.accountSwitcher.allAccounts}</span>
            </div>

            {/* โหลดรายการไม่สำเร็จ — บอกตรง ๆ ดีกว่าปล่อยหัวข้อลอยไม่มีอะไรอยู่ใต้มัน
                และต้องบอกทางออกที่ได้ผลจริง: dropdown ถูก toggle ด้วย CSS ของ Preline ไม่ได้ unmount
                useEffect([]) จึงไม่ยิงซ้ำตอนเปิดใหม่ — ทางเดียวที่ fetch ใหม่คือโหลดหน้าใหม่ */}
            {contextFailed && (
              <div className="text-default-400 px-3 py-2 text-xs">
                {t.accountSwitcher.loadError}
              </div>
            )}

            {/* Personal (ซ่อนถ้า personal = active) */}
            {context?.personal && activeShopId !== context.personal.shopId && (
              <button
                type="button"
                role="menuitem"
                onClick={() =>
                  handleSwitch(context.personal!.shopId, false, {
                    name: displayName,
                    kind: 'personal',
                    logo: user?.avatar ?? null,
                  })
                }
                disabled={switching}
                className="dropdown-item w-full flex items-center gap-3 text-start disabled:opacity-50"
              >
                <AccountAvatar src={user?.avatar} kind="personal" className="size-7" />
                <span className="flex-1 truncate">{displayName}</span>
                <span className="badge bg-default-100 text-default-500 shrink-0">{t.accountSwitcher.rolePersonal}</span>
              </button>
            )}

            {/* ยังไม่มีร้านส่วนตัว (ผู้ถูกเชิญ feature 00012) → เสนอให้สร้าง แทนตำแหน่งที่แถว personal
                จะอยู่. เส้นประ + primary = grammar เดียวกับปุ่ม "เปิดร้านของฉันเอง" ที่ ChooseShopClient
                ใช้อยู่แล้ว (ผู้ใช้จำ affordance "เส้นประ = สร้างของใหม่" ข้ามหน้าได้) */}
            {context && context.personal === null && (
              <button
                type="button"
                role="menuitem"
                onClick={createPersonalShop}
                disabled={creating}
                className="dropdown-item border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 mb-1 flex w-full items-start gap-2.5 rounded-lg border border-dashed text-start disabled:opacity-50"
              >
                <Icon
                  icon={creating ? 'loader-2' : 'plus'}
                  className={`mt-0.5 shrink-0${creating ? ' animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block font-medium">{t.accountSwitcher.createPersonalTitle}</span>
                  <span className="text-default-500 block text-xs">{t.accountSwitcher.createPersonalDesc}</span>
                </span>
              </button>
            )}

            {/* Business list (ซ่อนตัวที่ = active) */}
            {context?.businesses
              .filter((b) => b.shopId !== activeShopId)
              .map((b) => (
                <button
                  key={b.shopId}
                  type="button"
                  role="menuitem"
                  onClick={() => handleSwitch(b.shopId, b.locked, { name: b.shopName, kind: 'business', logo: b.logo })}
                  disabled={switching}
                  className="dropdown-item w-full flex items-center gap-3 text-start disabled:opacity-50"
                >
                  <AccountAvatar src={b.logo} kind="business" className="size-7" />
                  <span className="flex-1 truncate">{b.shopName}</span>
                  <span
                    className={`badge shrink-0 ${
                      b.role === 'OWNER' ? 'bg-primary/15 text-primary' : 'bg-info/15 text-info'
                    }`}
                  >
                    {b.role === 'OWNER' ? t.accountSwitcher.roleOwner : t.accountSwitcher.roleAdmin}
                  </span>
                  {b.locked && (
                    <span className="badge bg-danger/15 text-danger inline-flex shrink-0 items-center">
                      <Icon icon="lock" className="size-3" aria-hidden="true" />
                    </span>
                  )}
                </button>
              ))}

            {/* ไม่มีบัญชีอื่นให้สลับเลย (มีแต่ร้านส่วนตัวที่ active อยู่) → เสนอเปิดธุรกิจ
                grammar เดียวกับปุ่ม "สร้างร้านส่วนตัวของฉัน" ด้านบน (เส้นประ + primary) เพราะเป็น
                affordance เดียวกันคือ "เพิ่มบัญชีใหม่เข้ารายการนี้" ต่างที่ chevron ท้ายแถว —
                อันนี้พาไปหน้าฟอร์มหลายขั้น ไม่ใช่ action จบในตัวเหมือนปุ่มสร้างร้านส่วนตัว */}
            {/* 2026-08-05 (user สั่ง): เดิมมีเงื่อนไข !hasBusinessMembership ทำให้คนที่มีธุรกิจแล้ว
                ไม่เห็นปุ่มนี้เลย — ซึ่งเป็นคนกลุ่มที่อยากเปิดธุรกิจเพิ่มมากที่สุด
                ยังชี้ /business/create เหมือนเดิม (ไม่ใช่ ?create=1 ตรง ๆ) เพราะ gate โควตา/แพ็กเกจ
                อยู่ที่หน้านั้น — โควตาเต็มจะได้เห็นการ์ดอธิบายเหตุผล ไม่ใช่กดแล้วเงียบ */}
            {/* 🛑 ซ่อนในแอป iOS — ปลายทาง /business/create แสดงการ์ด "สมัครแพ็กเกจ Business ก่อน"
                พร้อมปุ่ม "ไปเลือกแพ็กเกจ" เมื่อยังไม่มีแพ็กเกจ/โควตาเต็ม = คำเชิญให้ซื้อ
                (Guideline 3.1.1 — ข้อที่เคยตีกลับ 2026-08-04) หน้านั้นกันซ้ำอีกชั้นด้วย redirect */}
            {context?.personal && !context.hidePayments && (
              <Link
                href="/business/create"
                role="menuitem"
                className="dropdown-item border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 mb-1 flex w-full items-start gap-2.5 rounded-lg border border-dashed text-start"
              >
                <Icon icon="plus" className="mt-0.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{t.accountSwitcher.createBusinessTitle}</span>
                  {/* คำอธิบายต้องตอบ "ทำไมต้องมี" ไม่ใช่พูดชื่อปุ่มซ้ำ — คู่ขนานกับปุ่มร้านส่วนตัว
                      ที่บอกว่า "ขายของในนามตัวเอง" อันนี้จึงบอกสิ่งที่ร้านส่วนตัวทำไม่ได้ */}
                  <span className="text-default-500 block text-xs">{t.accountSwitcher.createBusinessDesc}</span>
                </span>
                <Icon icon="chevron-right" className="text-default-400 mt-0.5 shrink-0" aria-hidden="true" />
              </Link>
            )}
        </>

        <div className="dropdown-divider"></div>

        {/* feature 00026 — ข้อมูลของ "ตัวคน" ผูกกับ session.user ไม่ผูกร้านที่ active อยู่
            2026-08-04: ตัด "แพ็กเกจธุรกิจ" (การ์ดเหนือเมนูซ้ายพาไป /business แล้ว) และ
            "โปรไฟล์ / ตั้งค่าร้าน" (= /shop ซึ่งอยู่ในกลุ่ม SETTING ของเมนูซ้ายแล้ว) ออก —
            dropdown นี้เหลือเฉพาะของ "ตัวคน" ไม่ปนกับของร้าน */}
        <Link href="/account" className="dropdown-item">
          <Icon icon="user-circle" className="me-1 fs-lg align-middle" />
          <span className="align-middle">{t.accountSwitcher.personalInfo}</span>
        </Link>

        {/* โปรไฟล์ = หน้าร้านจริงที่ลูกค้าเห็น (ป้ายเดิม "เปิดหน้าร้าน" — ใช้คำเดียวกับเมนูซ้ายแล้ว)
            แสดงเมื่อมี username: ทุก user มี /u/[username] ไม่ว่าจะเปิดร้านหรือยัง
            ข้าม subdomain ใช้ <a> ธรรมดา ไม่ใช่ <Link> */}
        {user?.username && (
          <a
            href={
              user.activeShopKind === 'BUSINESS' && user.activeShopSlug
                ? `${resolveBuyerBaseUrl()}/b/${user.activeShopSlug}`
                : `${resolveBuyerBaseUrl()}/u/${user.username}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="dropdown-item"
          >
            <Icon icon="building-store" className="me-1 fs-lg align-middle" />
            <span className="align-middle">{t.accountSwitcher.storefront}</span>
            <Icon icon="external-link" className="ms-auto size-3.5 align-middle" />
          </a>
        )}

        <div className="dropdown-divider"></div>

        {userProfileMenuData.map((item, idx) => (
          <Fragment key={idx}>
            <Link
              href={item.link}
              onClick={(e) => handleItemClick(e, item)}
              className={`dropdown-item${item.className ? ' ' + item.className : ''}`}
            >
              <Icon icon={item.icon} className="me-1 fs-lg align-middle" />
              <span className="align-middle">{item.label}</span>
            </Link>
            {item.divider && <div className="dropdown-divider"></div>}
          </Fragment>
        ))}
      </div>
    </div>

    <ShopSwitchOverlay show={switching} targetName={target?.name} targetKind={target?.kind} targetLogo={target?.logo} />
    {/* overlay ตอนสร้างร้าน — ยังไม่มีร้านให้เอ่ยชื่อ จึง override ข้อความ ไม่งั้นจะขึ้น "กำลังสลับบัญชี"
        ซึ่งบรรยายผิดเหตุการณ์ */}
    <ShopSwitchOverlay
      show={creating}
      label={t.accountSwitcher.creatingLabel}
      subLabel={t.accountSwitcher.creatingSubLabel}
    />
    </>
  )
}

export default UserDropdown
