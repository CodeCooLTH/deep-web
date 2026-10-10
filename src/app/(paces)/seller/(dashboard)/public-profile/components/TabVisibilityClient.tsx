'use client'

/**
 * TabVisibilityClient — การ์ด "แท็บบนหน้าร้าน" ให้ร้านซ่อนแท็บเนื้อหาเอง (CR 00053 2026-10-10 hide-tabs)
 *
 * Base: ./PriceVisibilityToggleClient.tsx — โครงการ์ด + optimistic + revert + pacesToast + แถบเตือน
 * Base: ./ProfileItemVisibilityClient.tsx — แถวในกริด md:grid-cols-2 + form-switch + แท็ก "ซ่อนอยู่"
 *   Adapt: ตัด thumbnail/ค้นหา/bulk · ใช้ไอคอนแท็บแทนรูป · ทั้งแถวเป็น <label> (tap target ≥44px)
 * Spec: safepay-ux 2026-10-10 — รีวิว/เกี่ยวกับร้านไม่ทำเป็นแถวล็อก ใช้บรรทัดอธิบายใต้รายการแทน
 *
 * PATCH ส่ง "ทั้งชุด" ไม่ใช่ทีละคีย์ — ชุดที่ซ่อนได้มีแค่ ≤5 คีย์ แทนที่ทั้งชุดง่ายกว่าและไม่มีสถานะครึ่ง ๆ
 */

import { useState } from 'react'

import { useT } from '@/i18n/LocaleProvider'
import { pacesToast } from '@/lib/paces-toast'
import type { HideableTabKey } from '@/lib/profile-tab-keys'
import Icon from '@/components/wrappers/Icon'
import { PROFILE_TAB_ICON } from '@/app/(paces)/seller/(fullscreen)/public-profile/builder/types'

interface TabVisibilityClientProps {
  /** แท็บที่ร้านนี้ซ่อนได้ (ตามประเภทร้าน) — ว่าง = ไม่แสดงการ์ด */
  tabs: HideableTabKey[]
  /** ShopPageLayout.hiddenTabs จาก SSR */
  initialHidden: string[]
}

export default function TabVisibilityClient({ tabs, initialHidden }: TabVisibilityClientProps) {
  const t = useT()
  const [hidden, setHidden] = useState<string[]>(initialHidden)
  const [pending, setPending] = useState(false)

  if (tabs.length === 0) return null

  const toggle = async (key: HideableTabKey, show: boolean) => {
    const prev = hidden
    const next = show ? hidden.filter((k) => k !== key) : [...hidden, key]
    setHidden(next) // optimistic
    setPending(true)

    try {
      const res = await fetch('/api/shops/current/page-builder/tabs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hiddenTabs: next }),
      })
      if (!res.ok) {
        setHidden(prev)
        pacesToast.error(t.publicProfile.tabVisibility.saveError)
        return
      }
      pacesToast.success(show ? t.publicProfile.tabVisibility.shownToast : t.publicProfile.tabVisibility.hiddenToast)
    } catch {
      setHidden(prev)
      pacesToast.error(t.publicProfile.tabVisibility.saveError)
    } finally {
      setPending(false)
    }
  }

  const hiddenCount = tabs.filter((k) => hidden.includes(k)).length

  return (
    <div className="card mb-base">
      <div className="card-header">
        <h4 className="card-title">{t.publicProfile.tabVisibility.cardTitle}</h4>
      </div>
      <div className="card-body">
        <p className="text-default-500 text-sm">{t.publicProfile.tabVisibility.subtitle}</p>

        <ul className="mt-3 grid gap-x-6 gap-y-0.5 md:grid-cols-2">
          {tabs.map((key) => {
            const on = !hidden.includes(key)
            return (
              <li key={key} className="border-default-200 border-b last:border-b-0 md:border-b-0">
                <label className="flex min-h-11 cursor-pointer items-center gap-3 py-2">
                  <Icon
                    icon={PROFILE_TAB_ICON[key]}
                    className={`size-5 shrink-0 ${on ? 'text-default-500' : 'text-default-400'}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${on ? 'text-default-900' : 'text-default-400'}`}>
                      {t.publicProfile.tabVisibility.names[key]}
                    </span>
                    {/* สถานะซ่อนบอกด้วยข้อความ ไม่ใช่ความจางอย่างเดียว (WCAG 1.4.1) */}
                    {!on && (
                      <span className="text-default-400 mt-0.5 block text-xs">
                        {t.publicProfile.tabVisibility.hiddenTag}
                      </span>
                    )}
                  </span>
                  <input
                    type="checkbox"
                    className="form-switch shrink-0"
                    checked={on}
                    disabled={pending}
                    onChange={(e) => toggle(key, e.target.checked)}
                  />
                </label>
              </li>
            )
          })}
        </ul>

        <p className="text-default-500 mt-3 flex items-start gap-1.5 text-xs">
          <Icon icon="info-circle" className="mt-px size-4 shrink-0" aria-hidden="true" />
          {t.publicProfile.tabVisibility.alwaysShown}
        </p>

        {hiddenCount > 0 && (
          <div className="bg-warning/15 text-warning-ink mt-3 rounded-lg p-3 text-xs">
            {t.publicProfile.tabVisibility.hiddenBanner}
          </div>
        )}
      </div>
    </div>
  )
}
