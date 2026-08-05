'use client'

/**
 * BusinessDangerZone — โซนอันตรายของธุรกิจ: ลบธุรกิจ (soft delete)
 *
 * ทำไมไม่ใช่ pacesConfirm (Swal): จอนี้ต้องมีทั้งรายการสิ่งที่จะเสีย และช่องพิมพ์ยืนยันชื่อร้าน
 * ซึ่ง Swal รองรับได้แค่ข้อความกับปุ่ม — เหตุผลเดียวกับที่ DeleteAccountCard เลือกโมดัลเอง
 *
 * soft delete (user เคาะ 2026-08-05): ข้อมูลไม่หายทันที ซ่อนจากทุกที่ + คืนโควตาธุรกิจ
 * เก็บไว้ 30 วัน (BUSINESS_DELETE_RETENTION_DAYS) ก่อนลบถาวร
 *
 * 🛑 copy ห้ามสัญญาว่า "กู้คืนได้" — service มี restoreBusinessShop อยู่ก็จริง แต่ **ยังไม่มี UI
 * ให้ผู้ใช้กดเอง** และ user ตัดสินแล้วว่า restore เป็นงานอนาคต (2026-08-05) การเขียนว่ากู้ได้
 * จึงเป็นการสัญญาสิ่งที่ผู้ใช้ทำไม่ได้จริง — บทเรียนเดียวกับกล่องยกเลิกออเดอร์ที่เคยบอกว่า
 * "สินค้าจะถูกคืนเข้าสต็อก" ทั้งที่ไม่ได้คืน
 *
 * Base: src/app/(paces)/seller/(dashboard)/account/components/DeleteAccountCard.tsx
 *   (การ์ดโซนอันตราย: card > card-header > h5 bg-danger/10 border-danger/30 border-dashed,
 *    แถวรายการ, ปุ่ม destructive, โมดัล controlled + Esc + focus management + ช่องพิมพ์ยืนยัน)
 *   ซึ่ง chase ต่อไปที่ theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/categories/components/AddCategoryModal.tsx
 * Base (ปุ่ม outline danger): theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx:177
 *   `btn border-danger text-danger hover:bg-danger hover:text-white`
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'

const ERROR_MESSAGE: Record<string, string> = {
  NOT_OWNER: 'เฉพาะเจ้าของธุรกิจเท่านั้นที่ลบได้',
  ALREADY_DELETED: 'ธุรกิจนี้ถูกลบไปแล้ว',
  unauthorized: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
}

/** สิ่งที่จะเกิดขึ้น — เขียนเป็นข้อ ๆ ให้เห็นภาพก่อนตัดสินใจ ไม่ใช่ย่อหน้ายาว */
const CONSEQUENCES = [
  { icon: 'eye-off', text: 'ร้านหายจากหน้าค้นหาและลิงก์สาธารณะทันที' },
  { icon: 'users-group', text: 'ทีมงานที่เชิญไว้เข้าใช้งานธุรกิจนี้ไม่ได้' },
  { icon: 'shopping-cart-off', text: 'คำสั่งซื้อ สินค้า และแชทของธุรกิจนี้ถูกซ่อนไปด้วย' },
  { icon: 'refresh', text: 'โควตาธุรกิจในแพ็กเกจคืนให้ทันที เปิดร้านใหม่แทนได้' },
  { icon: 'lock', text: 'เปิดร้านเดิมกลับมาเองไม่ได้' },
]

export default function BusinessDangerZone({
  shopId,
  shopName,
  retentionDays,
}: {
  shopId: string
  shopName: string
  retentionDays: number
}) {
  const router = useRouter()
  const { update } = useSession()
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const launcherRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  // Esc ปิด — โมดัลนี้ controlled ไม่ได้ผ่าน Preline จึงต้องผูกเอง (เหมือน DeleteAccountCard)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, submitting])

  useEffect(() => {
    if (open) closeRef.current?.focus()
    else launcherRef.current?.focus()
  }, [open])

  // พิมพ์ชื่อร้านให้ตรงเป๊ะถึงจะกดลบได้ — กันกดพลาดบนของที่กระทบทั้งทีม
  const canDelete = confirmText.trim() === shopName.trim() && !submitting

  const handleDelete = async () => {
    if (!canDelete) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/business/shops/${shopId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        pacesToast.error(ERROR_MESSAGE[data?.error ?? ''] ?? 'ลบธุรกิจไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      pacesToast.success('ลบธุรกิจแล้ว')
      // session ถือรายชื่อร้านที่ตัวสลับบัญชีใช้ — ไม่ update ร้านที่ลบไปแล้วจะยังค้างอยู่ในเมนู
      await update()
      router.push('/business')
      router.refresh()
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* ไม่ห่อ .card — อยู่ในเนื้อแท็บของ ShopForm ซึ่งอยู่ใน card-body อยู่แล้ว
          ห่อซ้ำจะกลายเป็นการ์ดซ้อนการ์ด (DESIGN.md ห้าม) */}
      <div className="border-danger/30 bg-danger/5 rounded-lg border border-dashed p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-danger flex items-center gap-1.5 text-sm font-semibold">
              <Icon icon="alert-triangle" aria-hidden="true" />
              ลบธุรกิจนี้
            </p>
            <p className="text-default-500 mt-1 text-xs">
              ร้านจะถูกซ่อนทันที ข้อมูลเก็บไว้ {retentionDays} วันก่อนลบถาวร · เปิดร้านเดิมกลับมาเองไม่ได้
            </p>
          </div>
          <button
            ref={launcherRef}
            type="button"
            onClick={() => setOpen(true)}
            className="btn border-danger text-danger hover:bg-danger shrink-0 hover:text-white"
          >
            ลบธุรกิจ
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="ปิด"
            onClick={() => !submitting && setOpen(false)}
            className="absolute inset-0 cursor-default"
            style={{ backgroundColor: 'rgba(49,58,70,0.34)' }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bdz-title"
            className="card pointer-events-auto relative flex max-h-full w-full max-w-md flex-col overflow-hidden"
          >
            <div className="border-default-300 flex shrink-0 items-center justify-between border-b p-5">
              <h3 id="bdz-title" className="card-title text-danger">
                ลบธุรกิจ &ldquo;{shopName}&rdquo;
              </h3>
              <button
                ref={closeRef}
                type="button"
                onClick={() => !submitting && setOpen(false)}
                aria-label="ปิด"
              >
                <Icon icon="x" className="text-xl" />
              </button>
            </div>

            <div className="card-body overflow-y-auto">
              <ul className="mb-4 space-y-2">
                {CONSEQUENCES.map((c) => (
                  <li key={c.text} className="text-default-700 flex items-start gap-2 text-sm">
                    <Icon icon={c.icon} className="text-default-400 mt-0.5 shrink-0" aria-hidden="true" />
                    <span>{c.text}</span>
                  </li>
                ))}
              </ul>

              <div className="bg-danger/10 border-danger/30 text-danger mb-4 rounded border border-dashed px-4 py-3 text-xs">
                ลบแล้วเปิดร้านเดิมกลับมาเองไม่ได้ · ข้อมูลเก็บไว้ {retentionDays} วันก่อนลบถาวร
              </div>

              <label className="form-label" htmlFor="bdz-confirm">
                พิมพ์ <span className="text-default-900 font-semibold">{shopName}</span> เพื่อยืนยัน
              </label>
              <input
                id="bdz-confirm"
                className="form-input"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={shopName}
                autoComplete="off"
              />
            </div>

            <div className="border-default-300 flex shrink-0 items-center justify-end gap-x-2 border-t p-5">
              <button
                type="button"
                className="btn bg-light hover:text-primary"
                onClick={() => !submitting && setOpen(false)}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!canDelete}
                className="btn bg-danger text-white disabled:opacity-50"
              >
                {submitting ? 'กำลังลบ...' : 'ลบธุรกิจนี้'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
