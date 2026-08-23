'use client'

/**
 * ProfileItemVisibilityClient — เลือกว่ารายการไหนขึ้นหน้าร้านสาธารณะ (feature 00053 FR-PPD-07)
 *
 * Base: src/app/(paces)/seller/(dashboard)/public-profile/components/PublishToggleClient.tsx
 *   — โครงการ์ด Paces (.card / .card-header / .card-body) + form-switch controlled + optimistic
 *   + revert เมื่อ PATCH ล้ม + pacesToast (Hard Rule 9)
 * Base: src/app/(paces)/seller/(dashboard)/public-profile/components/ShopVideosClient.tsx
 *   — แถวรายการที่มีรูปย่อ + ชื่อ + ตัวควบคุมท้ายแถว และช่องค้นหาเหนือรายการ
 *
 * 🛑 รายการทั้งหมดมาจาก SSR (prop `groups`) ไม่ยิง GET เอง — หน้านี้เป็น server component อยู่แล้ว
 * และการเพิ่ม endpoint อ่านอีกตัวแปลว่ามีสองที่ที่ต้องนิยาม "รายการไหนตั้งค่าได้บ้าง" ให้ตรงกัน
 */

import { useMemo, useState } from 'react'

import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { pacesToast } from '@/lib/paces-toast'
import { toFileUrl } from '@/lib/file-url'
import Icon from '@/components/wrappers/Icon'
import type { ProfileVisibilityGroup, ProfileItemKind } from '@/services/profile-visibility.service'

/** จำนวนแถวขั้นต่ำที่ทำให้ช่องค้นหาคุ้มพื้นที่ — น้อยกว่านี้กวาดตาหาเร็วกว่าพิมพ์ */
const SEARCH_THRESHOLD = 8

const GROUP_ICON: Record<ProfileItemKind, string> = {
  PRODUCT: 'package',
  ROOM: 'bed',
  SERVICE: 'tool',
}

export default function ProfileItemVisibilityClient({
  groups,
}: {
  groups: ProfileVisibilityGroup[]
}) {
  const t = useT()

  /**
   * override ของสวิตช์ที่ผู้ใช้เพิ่งกด — เก็บเฉพาะ id ที่ถูกแตะ ไม่ snapshot ทั้งรายการ
   * (แพตเทิร์นเดียวกับ likeOverrides ในกริดสินค้าหน้าร้าน) เพื่อให้ค่าที่ server ส่งมาใหม่หลัง
   * refresh เดินต่อได้เองในแถวที่ผู้ใช้ไม่ได้แตะ
   */
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [pendingIds, setPendingIds] = useState<Record<string, true>>({})
  const [query, setQuery] = useState('')

  const isOn = (id: string, fallback: boolean) => overrides[id] ?? fallback

  const totalItems = groups.reduce((n, g) => n + g.items.length, 0)
  const showSearch = totalItems >= SEARCH_THRESHOLD

  const q = query.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      groups.map((g) => ({
        ...g,
        items: q ? g.items.filter((i) => i.name.toLowerCase().includes(q)) : g.items,
      })),
    [groups, q],
  )
  const hasAnyResult = filtered.some((g) => g.items.length > 0)

  const toggle = async (kind: ProfileItemKind, id: string, next: boolean) => {
    setOverrides((m) => ({ ...m, [id]: next })) // optimistic
    setPendingIds((m) => ({ ...m, [id]: true }))
    try {
      const res = await fetch('/api/shops/current/page-builder/item-visibility', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id, showOnProfile: next }),
      })
      if (!res.ok) {
        setOverrides((m) => ({ ...m, [id]: !next })) // revert
        pacesToast.error(t.publicProfile.itemVisibility.saveError)
        return
      }
      pacesToast.success(
        next
          ? t.publicProfile.itemVisibility.shownToast
          : t.publicProfile.itemVisibility.hiddenToast,
      )
    } catch {
      setOverrides((m) => ({ ...m, [id]: !next })) // revert — network error
      pacesToast.error(t.publicProfile.itemVisibility.saveError)
    } finally {
      setPendingIds((m) => {
        const next = { ...m }
        delete next[id]
        return next
      })
    }
  }

  // ร้านที่ไม่มีรายการเลยสักชนิด — ไม่ต้องมีการ์ดเปล่า
  if (groups.length === 0) return null

  const groupLabel: Record<ProfileItemKind, string> = {
    PRODUCT: t.publicProfile.itemVisibility.groupProduct,
    ROOM: t.publicProfile.itemVisibility.groupRoom,
    SERVICE: t.publicProfile.itemVisibility.groupService,
  }

  return (
    <div className="card mb-base">
      <div className="card-header">
        <h4 className="card-title">{t.publicProfile.itemVisibility.cardTitle}</h4>
      </div>
      <div className="card-body">
        <p className="text-default-500 text-sm">{t.publicProfile.itemVisibility.subtitle}</p>

        {showSearch && (
          <div className="mt-base relative">
            <Icon
              icon="search"
              className="text-default-400 pointer-events-none absolute inset-y-0 start-3 my-auto size-4"
              aria-hidden="true"
            />
            <input
              type="search"
              className="form-input ps-9"
              placeholder={t.publicProfile.itemVisibility.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}

        {!hasAnyResult ? (
          <p className="text-default-400 mt-base text-center text-sm">
            {t.publicProfile.itemVisibility.noResults}
          </p>
        ) : (
          filtered.map((group) =>
            group.items.length === 0 ? null : (
              <section key={group.kind} className="mt-base">
                <div className="mb-2 flex flex-nowrap items-center justify-between gap-2">
                  <div className="text-default-900 flex min-w-0 items-center gap-1.5 text-sm font-medium">
                    <Icon icon={GROUP_ICON[group.kind]} className="text-default-500 size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{groupLabel[group.kind]}</span>
                  </div>
                  {/* ตัวนับต้องคิดจาก override ปัจจุบัน ไม่ใช่ค่าที่ server ส่งมาตอนโหลดหน้า —
                      ไม่งั้นกดปิดไป 3 ชิ้นแล้วเลขยังค้างที่เดิมจนกว่าจะรีโหลด (FR-PPD-12 AC-12-1) */}
                  <span className="text-default-500 shrink-0 text-xs tabular-nums">
                    {fmt(t.publicProfile.itemVisibility.countLabel, {
                      visible: group.items.filter((i) => isOn(i.id, i.showOnProfile)).length,
                      total: group.items.length,
                    })}
                  </span>
                </div>

                <ul className="divide-default-200 divide-y">
                  {group.items.map((item) => {
                    const on = isOn(item.id, item.showOnProfile)
                    const img = toFileUrl(item.imageFileId)
                    return (
                      <li key={item.id} className="flex items-center gap-3 py-2.5">
                        <div className="bg-default-100 size-10 shrink-0 overflow-hidden rounded-lg">
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element -- URL หลากโดเมน (storage/CDN)
                            <img src={img} alt="" className="size-full object-cover" loading="lazy" />
                          ) : (
                            <span className="text-default-400 flex size-full items-center justify-center">
                              <Icon icon={GROUP_ICON[group.kind]} className="size-4" aria-hidden="true" />
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <label
                            htmlFor={`item-visibility-${item.id}`}
                            className="text-default-900 block max-w-full truncate text-sm"
                          >
                            {item.name}
                          </label>
                          {item.pinned && (
                            <span className="text-default-500 mt-0.5 inline-flex items-center gap-1 text-xs">
                              <Icon icon="pin" className="size-3.5" aria-hidden="true" />
                              {t.publicProfile.itemVisibility.pinnedBadge}
                            </span>
                          )}
                        </div>

                        <input
                          id={`item-visibility-${item.id}`}
                          type="checkbox"
                          className="form-switch shrink-0"
                          checked={on}
                          disabled={Boolean(pendingIds[item.id])}
                          onChange={(e) => toggle(group.kind, item.id, e.target.checked)}
                        />
                      </li>
                    )
                  })}
                </ul>
              </section>
            ),
          )
        )}
      </div>
    </div>
  )
}
