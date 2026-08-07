'use client'

/**
 * BadgePickerModal — เลือกเหรียญตราเด่นสูงสุด 4 ใบ ด้วยมือ (feature 00035, Task 8)
 *
 * แทนที่ handleAddBadges เดิมใน LibraryPanel.tsx ที่ Task 7 ทำเป็น placeholder auto-pick 4 ใบแรก —
 * ตอนนี้ผู้ขายเลือกเองเป็นรายใบ + จัดลำดับภายในได้ (arrow ปุ่มขึ้น/ลง — เหตุผลไม่ใช้ drag ในโมดัลนี้:
 * ดู "ส่งกลับ / จุดที่ตัดสินใจเอง" ในรายงาน Task 8/9)
 *
 * [สำคัญ] เฉพาะ Badge.type='ACHIEVEMENT' เท่านั้น — กรองไว้แล้วที่ query ต้นทาง (getBuilderLibrary,
 * shop-page-layout.service.ts: `badge: { type: 'ACHIEVEMENT' }`) เหรียญ VERIFICATION ไม่มีทางโผล่มา
 * ถึง prop `badges` ของ modal นี้เลย — ไม่ต้องกรองซ้ำที่นี่ (mockup หัวข้อ 4 "เส้นแบ่งของเหรียญตรา")
 *
 * Base (shell โมดัลกลางจอ): src/app/(paces)/seller/(dashboard)/business/components/BusinessCreateModal.tsx
 *   (fixed inset-0 z-50 flex items-center justify-center + ปุ่มพื้นหลัง backdrop-blur + card role="dialog")
 *   — ตัดส่วน wizard/step ออกเพราะโมดัลนี้มีขั้นตอนเดียว ไม่ใช่ฟอร์มหลายขั้น
 * Base (แถวเลือก/จัดลำดับ): src/app/(paces)/seller/(dashboard)/dashboard/components/ShortcutEditSheet.tsx
 *   `ShortcutRow` — ทั้งแถวคือ tap target เดียว (≥44px) ปรับจาก add/remove (pin/unpin) เป็น
 *   select/deselect + เพิ่มปุ่มลูกศรขึ้น/ลงสำหรับจัดลำดับเฉพาะแถวที่เลือกแล้ว
 */
import { useEffect, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { badgeIconName } from '@/lib/badge-icons'
import { pacesToast } from '@/lib/paces-toast'
import type { BuilderLibraryBadge } from '@/services/shop-page-layout.service'

import { moveArrayItem } from '../lib/draft'
import type { BuilderDraftBadge } from '../types'

const MAX_BADGES = 4

export type BadgePickerModalProps = {
  open: boolean
  onClose: () => void
  /** ACHIEVEMENT เท่านั้น (กรองจากต้นทาง — ดู comment หัวไฟล์) */
  badges: BuilderLibraryBadge[]
  /** ค่าที่เลือกไว้แล้วในบล็อกปัจจุบัน (ถ้ามี) — เปิดโมดัลใหม่ทุกครั้งเริ่มจากค่านี้เสมอ ไม่ค้างค่าที่กด "ยกเลิก" ไปก่อนหน้า */
  initialSelected: BuilderDraftBadge[]
  onConfirm: (badges: BuilderDraftBadge[]) => void
}

export default function BadgePickerModal({ open, onClose, badges, initialSelected, onConfirm }: BadgePickerModalProps) {
  const [selected, setSelected] = useState<BuilderDraftBadge[]>(initialSelected)

  useEffect(() => {
    // sync เฉพาะตอน open เปลี่ยนเป็น true — ไม่ใช่ทุกครั้งที่ initialSelected identity เปลี่ยน
    // (parent re-render บ่อยจาก draft state ส่วนอื่นที่ไม่เกี่ยวกับเหรียญ)
    if (open) setSelected(initialSelected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // ล็อกการเลื่อนหน้าหลังระหว่างเปิด (เหมือน BusinessCreateModal.tsx)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  const addBadge = (b: BuilderLibraryBadge) => {
    if (selected.length >= MAX_BADGES) {
      pacesToast.info(`เลือกได้สูงสุด ${MAX_BADGES} ใบ — เอาใบอื่นออกก่อนถึงจะเพิ่มได้`)
      return
    }
    setSelected((prev) => [...prev, { id: b.id, badgeId: b.badgeId, name: b.name, nameEN: b.nameEN, icon: b.icon, imageUrl: null }])
  }

  const removeBadge = (id: string) => setSelected((prev) => prev.filter((s) => s.id !== id))
  const move = (index: number, direction: -1 | 1) => setSelected((prev) => moveArrayItem(prev, index, direction))

  const handleConfirm = () => {
    onConfirm(selected)
    onClose()
  }

  const unselected = badges.filter((b) => !selected.some((s) => s.id === b.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* ฉากหลัง: เบลอ + ม่านหมึกพลัม ไม่ใช่ดำสนิท (Ink-Tinted Shadow, DESIGN.md) — arbitrary carve-out
          เดียวกับ BusinessCreateModal.tsx (Paces ไม่มี token ของ backdrop overlay) */}
      <button
        type="button"
        aria-label="ปิดหน้าต่างเลือกเหรียญตรา"
        onClick={onClose}
        className="absolute inset-0 cursor-default backdrop-blur-[7px]" /* HR7 carve-out: backdrop overlay ไม่มี token ใน Paces — ยกมาจาก BusinessCreateModal.tsx ทั้งค่า */
        style={{ backgroundColor: 'rgba(49,58,70,0.34)' }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="badge-picker-title"
        className="card pointer-events-auto relative flex max-h-full w-full max-w-lg flex-col overflow-hidden"
      >
        <div className="border-default-300 flex shrink-0 items-center justify-between border-b p-5">
          <div>
            <h3 id="badge-picker-title" className="card-title">
              เลือกเหรียญตราเด่น
            </h3>
            <p className="text-default-400 mt-0.5 text-xs">
              เลือกได้สูงสุด {MAX_BADGES} ใบ · จัดลำดับได้
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด">
            <Icon icon="x" className="text-xl" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <h4 className="text-default-600 mb-2 text-xs font-semibold">
            เลือกแล้ว ({selected.length}/{MAX_BADGES})
          </h4>
          {selected.length === 0 ? (
            <p className="text-default-400 mb-4 text-sm">ยังไม่ได้เลือกเหรียญ — เลือกจากรายการด้านล่าง</p>
          ) : (
            <ul className="mb-4 grid gap-1.5">
              {selected.map((b, index) => (
                <li key={b.id} className="bg-primary/5 flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2">
                  <span className="bg-primary flex size-7 shrink-0 items-center justify-center rounded-full text-white">
                    <Icon icon={badgeIconName(b.nameEN, b.icon)} className="text-sm" aria-hidden="true" />
                  </span>
                  <span className="text-default-900 min-w-0 flex-1 truncate text-sm font-medium">{b.name}</span>
                  <div className="flex shrink-0 gap-0.5">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={`ย้าย ${b.name} ขึ้น`}
                      className="btn btn-icon btn-sm text-default-500 disabled:opacity-30"
                    >
                      <Icon icon="chevron-up" className="text-sm" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === selected.length - 1}
                      aria-label={`ย้าย ${b.name} ลง`}
                      className="btn btn-icon btn-sm text-default-500 disabled:opacity-30"
                    >
                      <Icon icon="chevron-down" className="text-sm" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBadge(b.id)}
                      aria-label={`เอา ${b.name} ออกจากที่เลือก`}
                      className="btn btn-icon btn-sm text-danger"
                    >
                      <Icon icon="x" className="text-sm" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <h4 className="text-default-600 mb-2 text-xs font-semibold">เลือกเพิ่ม</h4>
          {unselected.length === 0 ? (
            <p className="text-default-400 text-sm">
              {badges.length === 0 ? 'ร้านนี้ยังไม่มีเหรียญตรา (ACHIEVEMENT) ให้เลือก' : 'เลือกครบทุกเหรียญที่มีแล้ว'}
            </p>
          ) : (
            <ul className="grid gap-1.5">
              {unselected.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => addBadge(b)}
                    disabled={selected.length >= MAX_BADGES}
                    className="border-default-200 flex min-h-11 w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-start disabled:opacity-50"
                  >
                    <span className="bg-default-100 text-default-500 flex size-7 shrink-0 items-center justify-center rounded-full">
                      <Icon icon={badgeIconName(b.nameEN, b.icon)} className="text-sm" aria-hidden="true" />
                    </span>
                    <span className="text-default-900 min-w-0 flex-1 truncate text-sm font-medium">{b.name}</span>
                    <Icon icon="plus" className="text-primary size-5 shrink-0" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-default-300 flex shrink-0 items-center justify-between gap-2 border-t p-5">
          {/* badgeIds ฝั่ง backend ไม่มี minLength (Valibot อนุญาต array ว่าง — v.maxLength(4) เท่านั้น)
              แต่บล็อกที่มี 0 เหรียญ = ไม่เหลืออะไรให้ render จริง (PageBlocksSection early-return) —
              กันที่ฝั่งนี้แทนด้วยการปิดปุ่มบันทึก ไม่ให้เกิดบล็อกว่างเปล่าใน draft ตั้งแต่ต้น */}
          <span className="text-default-400 text-2xs">{selected.length === 0 && 'เลือกอย่างน้อย 1 ใบก่อนบันทึก'}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn border-default-300 text-default-900 hover:bg-default-50 border">
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selected.length === 0}
              className="btn bg-primary text-white hover:bg-primary-hover disabled:opacity-50"
            >
              บันทึก
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
