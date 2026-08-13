'use client'

/**
 * LanguagePrefsCard — เลือกภาษาของหน้าจอ (feature 00047, ผ่าน safepay-ux gate)
 *
 * Base: src/app/(paces)/seller/(dashboard)/account/components/NotificationPrefsCard.tsx
 *   — เปลือก `.card mt-4` + `.card-header` หัวข้อเส้นประ + คำอธิบาย `text-default-500 text-xs`
 *     + optimistic แล้ว revert เมื่อ PATCH ล้ม + `pacesToast` (Hard Rule 9) ยกมาทั้งชุด
 * Base (แถวเลือก): src/app/(paces)/seller/(dashboard)/products/components/ProductTypePickerCardV2.tsx
 *   — `input[type=radio].peer` + `label.peer-checked:*` (ตัวมันเองอ้างอิง
 *     theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx)
 *
 * 🛑 ต่างจาก Base ที่แถวเลือกจงใจ 1 จุด: ใช้ `peer sr-only` ไม่ใช่ `peer hidden`
 * `display:none` ถอด input ออกจาก tab order ทั้งหมด ⇒ ผู้ใช้คีย์บอร์ดและโปรแกรมอ่านหน้าจอ
 * โฟกัสไม่ได้เลย เป็นช่องโหว่ที่มีอยู่แล้วในไฟล์ต้นแบบแต่ไม่ควรก็อปต่อ — `sr-only` ซ่อนจากสายตา
 * แต่ยังอยู่ใน accessibility tree และรับโฟกัสได้ (จึงต้องมี `peer-focus-visible:ring-*` ที่ label
 * ไม่งั้นโฟกัสจะมองไม่เห็นเลยทั้งที่ไปถึงแล้ว)
 *
 * ทำไมไม่มีปุ่ม "บันทึก" แยก: เป็นค่าเดียวไม่มี field อื่นให้ dirty ร่วม จึงยึด pattern ของ
 * NotificationPrefsCard (กดแล้วเซฟทันที) ไม่ใช่ ProfileForm (dirty-check + ปุ่มรวม)
 *
 * ทำไมต้อง router.refresh() หลังบันทึก: ภาษาถูกตัดสินฝั่งเซิร์ฟเวอร์จาก `User.locale`
 * (src/i18n/server.ts) ⇒ ต้องให้ RSC เรนเดอร์ใหม่ ทั้ง `<html lang>` และทุกหน้าที่แปลแล้ว
 * ถึงจะเปลี่ยนตาม การ setState อย่างเดียวเปลี่ยนได้แค่ client component
 */

import Image, { type StaticImageData } from 'next/image'
import { useRouter } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'

import gbFlag from '@/assets/images/flags/gb.svg'
import thFlag from '@/assets/images/flags/th.svg'
import Icon from '@/components/wrappers/Icon'
import { useLocale, useT } from '@/i18n/LocaleProvider'
import type { Locale } from '@/i18n/locales'
import { pacesToast } from '@/lib/paces-toast'

const FLAGS: Record<Locale, StaticImageData> = { th: thFlag, en: gbFlag }

export default function LanguagePrefsCard() {
  const t = useT()
  const serverLocale = useLocale()
  const router = useRouter()

  // ค่าที่แสดงบนจอ — แยกจาก serverLocale เพื่อให้ไฮไลต์ขยับทันทีที่นิ้วปล่อย ไม่ต้องรอ round trip
  const [selected, setSelected] = useState<Locale>(serverLocale)
  const [saving, setSaving] = useState(false)
  const [isPending, startTransition] = useTransition()

  const options: { value: Locale; name: string }[] = [
    { value: 'th', name: t.language.th },
    { value: 'en', name: t.language.en },
  ]

  const choose = useCallback(
    async (next: Locale) => {
      if (next === selected || saving) return
      const previous = selected
      setSelected(next)
      setSaving(true)
      try {
        const res = await fetch('/api/users/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale: next }),
        })
        if (!res.ok) throw new Error('failed')
        pacesToast.success(t.account.language.saveSuccess)
        // refresh หลังบันทึกสำเร็จเท่านั้น — ถ้า refresh ตอนล้ม เซิร์ฟเวอร์จะส่งค่าเก่ากลับมา
        // ทับ state ที่เพิ่ง revert แล้วผู้ใช้จะเห็นค่ากระพริบไปมาโดยไม่มีคำอธิบาย
        startTransition(() => router.refresh())
      } catch {
        // revert — ถ้าไม่คืนค่า ผู้ใช้จะเชื่อว่าเปลี่ยนสำเร็จแล้วเจอภาษาเดิมทุกหน้าถัดไป
        setSelected(previous)
        pacesToast.error(t.account.language.saveError)
      } finally {
        setSaving(false)
      }
    },
    [selected, saving, router, t],
  )

  const busy = saving || isPending

  return (
    <div className="card mt-4">
      <div className="card-header">
        <h5 className="bg-light/15 border-default-300 flex w-full items-center justify-center gap-1.5 rounded border border-dashed p-1.25 text-sm font-medium">
          {t.account.language.cardTitle}
        </h5>
      </div>

      <div className="card-body">
        <p className="text-default-500 mb-4 text-xs">{t.account.language.description}</p>

        {/* fieldset + legend sr-only = ชื่อกลุ่มที่ role รองรับจริง
            (ต่างจากการแปะ aria-label บน <div> เปล่าซึ่ง screen reader ทิ้งทั้งบล็อก —
            docs/conventions/aria-name-requires-supporting-role.md) */}
        <fieldset
          className={`border-default-200 divide-default-200 divide-y overflow-hidden rounded border ${busy ? 'pointer-events-none opacity-60' : ''}`}
          disabled={busy}
        >
          <legend className="sr-only">{t.language.buttonLabel}</legend>

          {options.map((option) => {
            const active = option.value === selected
            return (
              <div key={option.value} className="relative">
                <input
                  type="radio"
                  name="deep-locale"
                  id={`locale-${option.value}`}
                  value={option.value}
                  checked={active}
                  onChange={() => choose(option.value)}
                  className="peer sr-only"
                />
                <label
                  htmlFor={`locale-${option.value}`}
                  className="peer-checked:border-primary peer-checked:bg-primary/5 peer-focus-visible:ring-primary hover:bg-default-50 flex cursor-pointer items-center gap-3 border-s-3 border-transparent px-4 py-3 peer-focus-visible:ring-2 peer-focus-visible:ring-inset"
                >
                  <Image src={FLAGS[option.value]} alt="" className="ring-default-200 size-5 shrink-0 rounded-full ring-1" />
                  <span className={`grow text-sm ${active ? 'text-primary font-medium' : 'text-dark'}`}>{option.name}</span>
                  {active && <Icon icon="circle-check" className="text-primary size-5 shrink-0" aria-hidden="true" />}
                </label>
              </div>
            )
          })}
        </fieldset>
      </div>
    </div>
  )
}
