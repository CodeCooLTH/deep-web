'use client'

/**
 * ChatShopSwitcher — ปุ่ม storefront ใน ChatHeader ที่คลิกแล้วเปิด dropdown สลับร้าน
 * (feat chat shop-switcher 2026-07-30) แทนที่ `<Link href="/dashboard">` เดิม (ปุ่มที่คลิกตรง
 * ไปหน้าหลักอย่างเดียว) — เพื่อให้ seller ที่ดูแลหลายร้านสลับ context ได้จากหน้าแชทเลย ไม่ต้อง
 * เด้งไป dashboard ก่อน สลับแล้วแชททั้งหมด (rail/unread/thread) โหลดใหม่ตามร้านที่เลือก
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx (Menu Alignment block —
 *   hs-dropdown relative inline-flex [--placement:bottom-right] + hs-dropdown-toggle + hs-dropdown-menu)
 * Pattern (business-context logic + active box + list + badge role/lock): คัดจาก in-app
 *   src/layouts/components/TopBar/components/UserDropdownDetailed.tsx (feat 00008 — theme-sourced มาแล้ว)
 *   ตัดส่วนที่ไม่เกี่ยวกับ chat ออก (แพ็กเกจธุรกิจ/ตั้งค่าร้าน/เปิดหน้าร้าน/ออกจากระบบ) เหลือ
 *   active box + สลับบัญชี + กลับหน้าหลัก
 *
 * ต่างจาก UserDropdownDetailed:
 *   - trigger = AccountAvatar (วงกลม) + chevron-down badge มุมล่างขวา (ไม่กินความกว้าง header
 *     ที่แน่นบนมือถือ) แทนปุ่มยาว avatar+ชื่อ+chevron ของ topbar
 *   - useShopSwitcher({ landingPath: '/inbox' }) — กลับหน้าแชท ไม่ใช่ /dashboard
 *   - placement bottom-right (ชิดขวา) เพราะ trigger อยู่ค่อนไปทางขวาของ header
 */

import AccountAvatar from '@/components/AccountAvatar'
import ShopSwitchOverlay from '@/components/paces/ShopSwitchOverlay'
import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { pacesToast } from '@/lib/paces-toast'
import { useShopSwitcher } from '@/hooks/useShopSwitcher'

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
  personal: { shopId: string; shopName: string } | null
  businesses: BusinessContextItem[]
}

type SessionUser = {
  displayName?: string
  username?: string
  avatar?: string | null
  hasBusinessMembership?: boolean
  activeShopId?: string | null
  activeShopRole?: 'OWNER' | 'ADMIN'
  activeShopKind?: 'PERSONAL' | 'BUSINESS'
  activeShopName?: string | null
  activeShopLogo?: string | null
}

/**
 * feature 00037 — สวิตช์ "มุมมองกล่องข้อความ" อยู่ในเมนูนี้ ไม่ใช่ปุ่มใหม่ในหัวแชท
 *
 * เหตุผล (ux spec §0 กางเลขจากโค้ดจริง): ที่ 320px หัวแชทเหลือที่ให้ช่องค้นหาราว 140px หลังหัก
 * โลโก้+ปุ่มเสียง+ปุ่มนี้ — เติมปุ่มใหม่อีก 44px จะเหลือ ~92px ซึ่งเริ่มฝืน และเป็นการย้อนบั๊ก
 * แถบเครื่องมือล้นขอบจอที่เพิ่งแก้เมื่อ 2026-08-07
 *
 * เงื่อนไขแสดง = hasBusinessMembership ตัวเดิมที่ไฟล์นี้คำนวณอยู่แล้ว ซึ่งตรงกับ requirement
 * "ผู้ใช้ร้านเดียวต้องไม่เห็นสวิตช์เลย" พอดี — ไม่ต้อง query อะไรเพิ่ม
 *
 * 🛑 ไม่แตะ switchShop()/activeShopId เด็ดขาด — คนละ action คนละ endpoint (BR-UNI-07):
 * การเปลี่ยนมุมมองห้ามเปลี่ยนร้านที่กำลังใช้งานของทั้งแอป
 */
export default function ChatShopSwitcher({ chatScopeMode }: { chatScopeMode: 'SINGLE' | 'UNIFIED' }) {
  const { data: session } = useSession()
  const user = session?.user as SessionUser | undefined

  const t = useT()
  const displayName = user?.displayName ?? user?.username ?? t.accountSwitcher.fallbackUser
  const hasBusinessMembership = user?.hasBusinessMembership === true
  const activeShopId = user?.activeShopId

  // identity ที่ active ตอนนี้ (business → ร้าน, ไม่งั้น personal)
  const isBusiness = user?.activeShopKind === 'BUSINESS'
  const activeName = isBusiness ? (user?.activeShopName ?? t.menu.shop) : displayName
  const activeLogo = isBusiness ? (user?.activeShopLogo ?? null) : (user?.avatar ?? null)
  const activeRoleLabel = isBusiness
    ? user?.activeShopRole === 'ADMIN'
      ? t.accountSwitcher.roleAdmin
      : t.accountSwitcher.roleOwner
    : t.accountSwitcher.rolePersonal

  const [context, setContext] = useState<BusinessContextResponse | null>(null)

  // โหมดมุมมอง — optimistic: สลับ segment ทันทีไม่รอ response (การกดสวิตช์ที่หน่วงคือสิ่งที่
  // ผู้ใช้อ่านว่า "กดไม่ติด" แล้วกดซ้ำ) ล้มเหลว → เด้งกลับค่าเดิม + แจ้งเตือน
  const router = useRouter()
  const [scopeMode, setScopeMode] = useState<'SINGLE' | 'UNIFIED'>(chatScopeMode)
  const [savingScope, setSavingScope] = useState(false)
  // prop เปลี่ยนเมื่อ server re-render (เช่นกดสลับจากอีกแท็บ) — sync ตาม ไม่งั้นค่าค้าง
  useEffect(() => setScopeMode(chatScopeMode), [chatScopeMode])

  const changeScopeMode = async (next: 'SINGLE' | 'UNIFIED') => {
    if (savingScope || next === scopeMode) return
    const before = scopeMode
    setScopeMode(next)
    setSavingScope(true)
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatScopeMode: next }),
      })
      if (!res.ok) throw new Error('save failed')
      // refresh ไม่ใช่ hard-navigate — ขอบเขตถูก resolve ฝั่ง server ทุกหน้าของกล่องข้อความ
      // การ refresh จึงพารายการ/แท็บ/rail มาใหม่ครบโดยไม่ปิด dropdown และไม่กระพริบทั้งหน้า
      router.refresh()
    } catch {
      setScopeMode(before)
      pacesToast.error(t.accountSwitcher.viewChangeError)
    } finally {
      setSavingScope(false)
    }
  }
  // สลับแล้วกลับมาที่แชท (ไม่ใช่ /dashboard) — แชทของร้านใหม่โหลดตามทันทีหลัง hard-navigate
  const { switching, target, switchShop } = useShopSwitcher({ landingPath: '/inbox' })

  useEffect(() => {
    // guard: fetch เฉพาะเมื่อมี business membership จริง (กันยิง request เปล่าให้ seller ร้านเดียว)
    if (!hasBusinessMembership) return
    let cancelled = false
    // no-store + cache-buster query: กัน cache ทุกชั้น serve response เก่า (ร้านใหม่ไม่โผล่)
    fetch(`/api/business/context?_t=${Date.now()}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setContext({ personal: data.personal, businesses: data.businesses ?? [] })
      })
      .catch(() => {
        /* เงียบ — progressive enhancement ไม่บล็อก UI หลักของ dropdown */
      })
    return () => {
      cancelled = true
    }
  }, [hasBusinessMembership])

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

  return (
    <>
      <div className="hs-dropdown relative inline-flex [--placement:bottom-right]">
        {/* trigger — avatar วงกลม + chevron badge มุมล่างขวา (สื่อว่าเป็นเมนู ไม่เพิ่มความกว้าง header) */}
        <button
          type="button"
          className="hs-dropdown-toggle relative inline-flex size-11 shrink-0 cursor-pointer items-center justify-center"
          aria-haspopup="menu"
          aria-expanded="false"
          aria-label={
            hasBusinessMembership && scopeMode === 'UNIFIED'
              ? t.accountSwitcher.switcherAriaUnified
              : fmt(t.accountSwitcher.switcherAriaSingle, { name: activeName })
          }
        >
          <AccountAvatar src={activeLogo} kind={isBusiness ? 'business' : 'personal'} className="size-9" />
          {/* badge เดิมของปุ่ม — เปลี่ยน "ไอคอนใน slot เดิม" ไม่ได้เพิ่มความกว้าง header เลย
              (chevron = ร้านเดียว / ตาราง = กำลังรวมทุกร้าน) เป็นสัญญาณโหมดที่เห็นตลอดเวลา */}
          <span
            className={`border-default-300 absolute end-0.5 bottom-0.5 inline-flex size-4 items-center justify-center rounded-full border ${
              hasBusinessMembership && scopeMode === 'UNIFIED' ? 'bg-primary border-primary' : 'bg-card'
            }`}
          >
            {/* กำลังบันทึกโหมด → หมุนที่ badge เดิม (ux gate 2026-08-08): ระหว่างรอ PATCH + refresh
                หน้าจอเดิมค้างนิ่งไม่มีสัญญาณใด ๆ ว่ากำลังทำงาน — ใช้ slot เดิมจึงไม่กินความกว้าง
                เพิ่มแม้แต่พิกเซลเดียว และครอบทั้งมือถือ/เดสก์ท็อปด้วยจุดเดียว */}
            <Icon
              icon={
                savingScope
                  ? 'loader-2'
                  : hasBusinessMembership && scopeMode === 'UNIFIED'
                    ? 'layout-grid'
                    : 'chevron-down'
              }
              className={`size-3 ${savingScope ? 'animate-spin ' : ''}${
                hasBusinessMembership && scopeMode === 'UNIFIED' ? 'text-white' : 'text-default-600'
              }`}
            />
          </span>
        </button>

        <div className="hs-dropdown-menu min-w-72 p-2" role="menu" aria-orientation="vertical">
          {/* มุมมองกล่องข้อความ (feature 00037) — เฉพาะผู้ใช้ที่มีมากกว่า 1 ร้าน
              Base: segmented tabs ของ InboxList.tsx (bg-light p-1 / active = bg-card shadow-sm) */}
          {hasBusinessMembership && (
            <>
              <div className="px-2 pt-1 pb-1">
                <span className="text-default-700 text-xs">{t.accountSwitcher.inboxView}</span>
              </div>
              <div className="bg-light mb-2 flex gap-1 rounded-lg p-1" role="group" aria-label={t.accountSwitcher.inboxView}>
                {(
                  [
                    { key: 'UNIFIED' as const, label: t.accountSwitcher.viewAllShops, icon: 'layout-grid' },
                    { key: 'SINGLE' as const, label: t.accountSwitcher.viewThisShop, icon: 'building-store' },
                  ]
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => void changeScopeMode(opt.key)}
                    aria-pressed={scopeMode === opt.key}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs ${
                      scopeMode === opt.key
                        ? 'bg-card text-default-900 font-semibold shadow-sm'
                        : 'text-default-500'
                    }`}
                  >
                    <Icon icon={opt.icon} className="size-3.5 shrink-0" />
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="border-default-200 mb-2 border-t" />
            </>
          )}

          {/* active account — กล่องไฮไลต์บนสุด (จาก session, ไม่รอ fetch) */}
          <div className="border-primary bg-primary/5 flex items-center gap-3 rounded-lg border px-3 py-2.5">
            <AccountAvatar src={activeLogo} kind={isBusiness ? 'business' : 'personal'} className="size-9" />
            <div className="min-w-0">
              <p className="text-body-color truncate text-sm font-semibold">{activeName}</p>
              <p className="text-default-700 truncate text-xs">{activeRoleLabel}</p>
            </div>
          </div>

          {/* สลับบัญชี — เฉพาะ seller ที่มี business membership; list ไม่รวมบัญชีที่ active */}
          {hasBusinessMembership && (
            <>
              <div className="px-2 pt-3 pb-1">
                <span className="text-default-700 text-xs">{t.accountSwitcher.switchAccount}</span>
              </div>

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
                  className="dropdown-item flex w-full items-center gap-3 text-start disabled:opacity-50"
                >
                  <AccountAvatar src={user?.avatar} kind="personal" className="size-7" />
                  <span className="flex-1 truncate">{displayName}</span>
                  <span className="badge bg-default-100 text-default-700 shrink-0">{t.accountSwitcher.rolePersonal}</span>
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
                    className="dropdown-item flex w-full items-center gap-3 text-start disabled:opacity-50"
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
            </>
          )}

          <div className="dropdown-divider"></div>

          <Link href="/dashboard" className="dropdown-item" aria-label={t.inbox.backToDashboard}>
            <Icon icon="home-2" className="fs-lg me-1 align-middle" />
            <span className="align-middle">{t.inbox.backToDashboard}</span>
          </Link>
        </div>
      </div>

      <ShopSwitchOverlay show={switching} targetName={target?.name} targetKind={target?.kind} targetLogo={target?.logo} />
    </>
  )
}
