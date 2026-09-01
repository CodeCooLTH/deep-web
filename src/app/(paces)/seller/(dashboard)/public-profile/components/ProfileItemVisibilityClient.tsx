'use client'

/**
 * ProfileItemVisibilityClient — เลือกว่ารายการไหนขึ้นหน้าร้านสาธารณะ (feature 00053 FR-PPD-07)
 *
 * 🔄 **redesign 2026-08-23 — user บอกว่า "UI ใช้ยาก"** (ม็อกอัพ + เหตุผลเต็ม:
 * `docs/superpowers/specs/2026-08-23-item-visibility-redesign.md`)
 *
 * ของเดิมเป็นรายการแถวเดียวเต็มความกว้างการ์ด ปัญหาที่วัดได้จากหน้าจริงของร้านที่มีสินค้า 32 ชิ้น:
 *   1. สวิตช์อยู่ขอบขวาสุด **ห่างจากชื่อสินค้า ~1,800px บนจอ 1440** — ตาต้องวิ่งข้ามจอทั้งใบ
 *      ต่อการกดหนึ่งครั้ง และไม่มีอะไรลากสายตาให้รู้ว่ากำลังกดแถวไหนอยู่
 *   2. 32 แถว × 79px ≈ เลื่อน 2,500px กลางหน้าตั้งค่า ⇒ การ์ดที่อยู่ใต้มันถูกดันหายไป
 *   3. ไม่มีปุ่มทำทีเดียวทั้งชุด — ร้านที่อยากซ่อนเกือบหมดต้องกดทีละ 30 ครั้ง
 *   4. มองไม่ออกว่าอันไหนถูกซ่อน ถ้าไม่ไล่ดูสวิตช์ทีละอัน
 *
 * แก้ด้วย: กริด 2 คอลัมน์ (แถวกว้าง ≤ ครึ่งการ์ด) · ชิปกรอง แสดงอยู่/ซ่อนอยู่ · ปุ่มทั้งชุด ·
 * แถวที่ซ่อนจางลง + มีป้ายข้อความ · ตั้งต้น 12 แถวต่อกลุ่มแล้วค่อยกาง
 *
 * Base: src/app/(paces)/seller/(dashboard)/public-profile/components/PublishToggleClient.tsx
 *   — โครงการ์ด Paces (.card / .card-header / .card-body) + form-switch controlled + optimistic
 *   + revert เมื่อ PATCH ล้ม + pacesToast (Hard Rule 9)
 * Base: src/app/(paces)/seller/(dashboard)/public-profile/components/ShopVideosClient.tsx
 *   — แถวรายการที่มีรูปย่อ + ชื่อ + ตัวควบคุมท้ายแถว และช่องค้นหาเหนือรายการ
 * Base: src/lib/paces-swal.ts (pacesConfirm.warning) — ยืนยันก่อนทำสิ่งที่ย้อนกลับยาก
 *
 * 🛑 รายการทั้งหมดมาจาก SSR (prop `groups`) ไม่ยิง GET เอง — หน้านี้เป็น server component อยู่แล้ว
 * และการเพิ่ม endpoint อ่านอีกตัวแปลว่ามีสองที่ที่ต้องนิยาม "รายการไหนตั้งค่าได้บ้าง" ให้ตรงกัน
 */

import { useMemo, useState } from 'react'

import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'
import { toFileUrl } from '@/lib/file-url'
import Icon from '@/components/wrappers/Icon'
import type { ProfileVisibilityGroup, ProfileItemKind } from '@/services/profile-visibility.service'

/** จำนวนแถวขั้นต่ำที่ทำให้ช่องค้นหาคุ้มพื้นที่ — น้อยกว่านี้กวาดตาหาเร็วกว่าพิมพ์ */
const SEARCH_THRESHOLD = 8

/**
 * แสดงกี่แถวต่อกลุ่มก่อนต้องกด "ดูทั้งหมด"
 *
 * 🛑 มีไว้กันการ์ดนี้ยืดจนกลืนหน้าตั้งค่าทั้งหน้า (ร้านจริงมีสินค้า 32 ชิ้น = เลื่อน ~2,500px)
 * 12 = 6 แถวบนกริด 2 คอลัมน์ ⇒ สูงพอ ๆ กับการ์ดอื่นในหน้าเดียวกัน
 */
const COLLAPSED_ROWS = 12

const GROUP_ICON: Record<ProfileItemKind, string> = {
  PRODUCT: 'package',
  ROOM: 'bed',
  SERVICE: 'tool',
}

type VisibilityFilter = 'ALL' | 'SHOWN' | 'HIDDEN'

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
  const [bulkPending, setBulkPending] = useState<ProfileItemKind | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<VisibilityFilter>('ALL')
  /** กลุ่มที่ถูกกาง "ดูทั้งหมด" แล้ว */
  const [expanded, setExpanded] = useState<Record<string, true>>({})

  const isOn = (id: string, fallback: boolean) => overrides[id] ?? fallback

  const totalItems = groups.reduce((n, g) => n + g.items.length, 0)
  const showSearch = totalItems >= SEARCH_THRESHOLD

  const q = query.trim().toLowerCase()

  /**
   * ตัวเลขบนชิปนับจาก **สถานะปัจจุบัน** (override ที่ผู้ใช้เพิ่งกด) ไม่ใช่ค่าที่ server ส่งมาตอน
   * โหลดหน้า — กดซ่อนไป 3 ชิ้นแล้วชิป "ซ่อนอยู่" ต้องขึ้นเป็น 3 ทันที ไม่ใช่รอรีโหลด (AC-12-1)
   */
  const counts = useMemo(() => {
    let shown = 0
    for (const g of groups) for (const i of g.items) if (isOn(i.id, i.showOnProfile)) shown++
    return { all: totalItems, shown, hidden: totalItems - shown }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isOn อ่าน overrides ซึ่งอยู่ใน deps แล้ว
  }, [groups, overrides, totalItems])

  const matchFilter = (on: boolean) =>
    filter === 'ALL' || (filter === 'SHOWN' ? on : !on)

  const filtered = useMemo(
    () =>
      groups.map((g) => ({
        ...g,
        items: g.items.filter(
          (i) =>
            (!q || i.name.toLowerCase().includes(q)) && matchFilter(isOn(i.id, i.showOnProfile)),
        ),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, q, filter, overrides],
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
        const next2 = { ...m }
        delete next2[id]
        return next2
      })
    }
  }

  /**
   * เปิด/ปิดทั้งกลุ่มด้วย request เดียว
   *
   * 🛑 **ต้องยิง endpoint แบบชุด ไม่ใช่วน `toggle()` ทีละรายการ** — ร้านที่มีสินค้า 32 ชิ้นจะยิง
   * 32 request แล้วชน rate-limit ของ `guardApi` (mutation ผู้ใช้ล็อกอิน 30/นาที) ⇒ บางชิ้นถูก
   * เปลี่ยน บางชิ้นไม่ถูก โดยไม่มีอะไรบอกว่าอันไหนพลาด
   *
   * 🛑 ถามยืนยันเฉพาะทิศ "ซ่อนทั้งหมด" — กดพลาดครั้งเดียวแปลว่าหน้าร้านว่างทั้งแท็บทันที ส่วน
   * "แสดงทั้งหมด" ย้อนกลับได้ด้วยการกดอีกปุ่มที่อยู่ข้าง ๆ กัน จึงไม่ต้องขวาง
   * (ทิศทางเสี่ยงกลับด้านกับสวิตช์เผยแพร่ใน PublishToggleClient — ที่นั่นเสี่ยงตอนปิดทั้งหน้า)
   */
  const bulk = async (kind: ProfileItemKind, next: boolean, itemIds: string[]) => {
    if (!next) {
      const confirmed = await pacesConfirm.warning(
        t.publicProfile.itemVisibility.hideAllConfirmTitle,
        t.publicProfile.itemVisibility.hideAllConfirmBody,
        {
          confirmButtonText: t.publicProfile.itemVisibility.hideAll,
          cancelButtonText: t.common.cancel,
        },
      )
      if (!confirmed) return
    }

    const before = { ...overrides }
    setBulkPending(kind)
    setOverrides((m) => {
      const patch = { ...m }
      for (const id of itemIds) patch[id] = next
      return patch
    })
    try {
      const res = await fetch('/api/shops/current/page-builder/item-visibility', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, showOnProfile: next, scope: 'ALL' }),
      })
      if (!res.ok) {
        setOverrides(before) // revert ทั้งชุดกลับไปสภาพก่อนกด
        pacesToast.error(t.publicProfile.itemVisibility.saveError)
        return
      }
      pacesToast.success(
        next
          ? t.publicProfile.itemVisibility.shownToast
          : t.publicProfile.itemVisibility.hiddenToast,
      )
    } catch {
      setOverrides(before)
      pacesToast.error(t.publicProfile.itemVisibility.saveError)
    } finally {
      setBulkPending(null)
    }
  }

  // ร้านที่ไม่มีรายการเลยสักชนิด — ไม่ต้องมีการ์ดเปล่า
  if (groups.length === 0) return null

  const groupLabel: Record<ProfileItemKind, string> = {
    PRODUCT: t.publicProfile.itemVisibility.groupProduct,
    ROOM: t.publicProfile.itemVisibility.groupRoom,
    SERVICE: t.publicProfile.itemVisibility.groupService,
  }

  const chips: { key: VisibilityFilter; label: string }[] = [
    { key: 'ALL', label: fmt(t.publicProfile.itemVisibility.chipAll, { n: counts.all }) },
    { key: 'SHOWN', label: fmt(t.publicProfile.itemVisibility.chipShown, { n: counts.shown }) },
    { key: 'HIDDEN', label: fmt(t.publicProfile.itemVisibility.chipHidden, { n: counts.hidden }) },
  ]

  return (
    <div className="card mb-base">
      <div className="card-header flex-nowrap">
        <h4 className="card-title truncate">{t.publicProfile.itemVisibility.cardTitle}</h4>
        <span className="text-default-500 shrink-0 text-xs tabular-nums">
          {fmt(t.publicProfile.itemVisibility.countLabel, {
            visible: counts.shown,
            total: counts.all,
          })}
        </span>
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

        {/* ชิปกรอง — ตอบคำถาม "ฉันซ่อนอะไรไว้บ้าง" ซึ่งของเดิมตอบไม่ได้เลยถ้าไม่ไล่ดูทีละสวิตช์ */}
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t.publicProfile.itemVisibility.cardTitle}>
          {chips.map((c) => {
            const on = filter === c.key
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(c.key)}
                className={
                  on
                    ? 'bg-primary/10 text-primary-ink inline-flex min-h-11 lg:min-h-9 items-center rounded-full px-3 text-xs font-semibold'
                    : 'bg-default-100 text-default-600 hover:bg-default-200 min-h-11 lg:min-h-0 inline-flex min-h-11 lg:min-h-9 items-center rounded-full px-3 text-xs'
                }
              >
                {c.label}
              </button>
            )
          })}
        </div>

        {!hasAnyResult ? (
          <p className="text-default-400 mt-base text-center text-sm">
            {t.publicProfile.itemVisibility.noResults}
          </p>
        ) : (
          filtered.map((group) => {
            if (group.items.length === 0) return null
            const isExpanded = Boolean(expanded[group.kind])
            const visible = isExpanded ? group.items : group.items.slice(0, COLLAPSED_ROWS)
            const allIds = group.items.map((i) => i.id)
            const busy = bulkPending === group.kind

            return (
              <section key={group.kind} className="mt-base">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-default-900 flex min-w-0 items-center gap-1.5 text-sm font-medium">
                    <Icon
                      icon={GROUP_ICON[group.kind]}
                      className="text-default-500 size-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span className="truncate">{groupLabel[group.kind]}</span>
                  </div>
                  {/* ปุ่มทั้งชุด — โผล่เฉพาะตอนมีของมากพอที่การกดทีละอันจะน่าเบื่อจริง */}
                  {group.items.length > 3 && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => bulk(group.kind, true, allIds)}
                        className="btn bg-default-100 text-default-900 hover:bg-default-200 min-h-11 px-3 text-xs lg:min-h-9"
                      >
                        {t.publicProfile.itemVisibility.showAll}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => bulk(group.kind, false, allIds)}
                        className="btn bg-default-100 text-default-900 hover:bg-default-200 min-h-11 px-3 text-xs lg:min-h-9"
                      >
                        {t.publicProfile.itemVisibility.hideAll}
                      </button>
                    </div>
                  )}
                </div>

                {/* กริด 2 คอลัมน์ตั้งแต่ md — สวิตช์อยู่ห่างจากชื่อไม่เกินครึ่งความกว้างการ์ด
                    (เดิมแถวเต็มความกว้าง = ห่าง ~1,800px บนจอ 1440) */}
                <ul className="grid gap-x-6 gap-y-0.5 md:grid-cols-2">
                  {visible.map((item) => {
                    const on = isOn(item.id, item.showOnProfile)
                    const img = toFileUrl(item.imageFileId)
                    return (
                      <li
                        key={item.id}
                        className="border-default-200 flex items-center gap-3 border-b py-2 last:border-b-0 md:border-b-0"
                      >
                        <div
                          className={`bg-default-100 size-9 shrink-0 overflow-hidden rounded-lg ${on ? '' : 'opacity-45'}`}
                        >
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
                            className={`block max-w-full truncate text-sm ${on ? 'text-default-900' : 'text-default-400'}`}
                          >
                            {item.name}
                          </label>
                          {/* 🛑 สถานะ "ถูกซ่อน" ต้องบอกด้วยข้อความ ไม่ใช่ความจางอย่างเดียว —
                              คนตาบอดสี/จอที่ปรับคอนทราสต์ต่ำแยกไม่ออก (WCAG 1.4.1) */}
                          {!on && (
                            <span className="text-default-400 mt-0.5 block text-xs">
                              {t.publicProfile.itemVisibility.hiddenTag}
                            </span>
                          )}
                          {on && item.pinned && (
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
                          disabled={Boolean(pendingIds[item.id]) || busy}
                          onChange={(e) => toggle(group.kind, item.id, e.target.checked)}
                        />
                      </li>
                    )
                  })}
                </ul>

                {!isExpanded && group.items.length > COLLAPSED_ROWS && (
                  <button
                    type="button"
                    onClick={() => setExpanded((m) => ({ ...m, [group.kind]: true }))}
                    className="border-default-200 text-default-600 hover:bg-default-100 mt-2 min-h-11 w-full rounded-lg border border-dashed text-xs lg:min-h-10"
                  >
                    {fmt(t.publicProfile.itemVisibility.showMore, { n: group.items.length })}
                  </button>
                )}
              </section>
            )
          })
        )}
      </div>
    </div>
  )
}
