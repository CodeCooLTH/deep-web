'use client'

/**
 * DeleteAccountCard — ปุ่ม "ลบบัญชี" ของผู้ขาย + โมดัลยืนยัน
 *
 * ทำไมต้องมี: App Store Guideline 5.1.1(v) — แอปที่สมัครบัญชีได้ ต้องให้ผู้ใช้ "เริ่มลบบัญชี"
 * ได้จากในแอป การลิงก์ไปหน้าที่เขียนว่า "ส่งอีเมลมาขอลบ" ไม่ผ่านเกณฑ์ และ deep-seller-app
 * เป็น WebView-first (โหลด seller.deepthailand.app) → ปุ่มที่อยู่ในเว็บนี่แหละคือปุ่มในแอป
 *
 * ทำไมวางที่ /account (ย้ายมาจาก /shop เมื่อ 2026-08-04): ลบบัญชีคือลบ **"ตัวคน"** ไม่ใช่ลบร้าน
 * จึงเข้าพวกกับ "ข้อมูลส่วนตัว" และ "วิธีเข้าสู่ระบบ" บนหน้าเดียวกัน ตรงกับเส้นแบ่งที่ feature
 * 00026 ตั้งไว้ ("ถ้าผมอยู่ร้าน BT, ธนภัทร ก็ต้องตั้ง Profile account ของตัวเองได้")
 * ที่เดิม (/shop) ทำให้ปนกับชื่อร้าน/โลโก้ร้าน จนอ่านไม่ออกว่ากำลังจะลบร้านหรือลบบัญชี
 * และแถบ "บันทึกการเปลี่ยนแปลง" (fixed) ของ ShopForm ลอยทับการ์ดนี้ทั้งที่ไม่เกี่ยวกันเลย
 *
 * ทำไมเป็นโมดัล ไม่ใช่ pacesConfirm (Swal) เหมือน SignOutCard: หน้าจอนี้ต้องมีทั้งรายการสิ่งที่
 * จะเสีย, ตัวบล็อกที่กดไปจัดการต่อได้, และช่องพิมพ์ยืนยัน — Swal รองรับได้แค่ข้อความกับปุ่ม
 *
 * Base (modal shell): src/app/(paces)/seller/(dashboard)/admins/components/InviteLinkModal.tsx
 *   (controlled overlay + card > card-header > card-body + Esc + focus management)
 *   ซึ่ง chase ต่อไปที่ theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/categories/components/AddCategoryModal.tsx
 * Base (การ์ด + ปุ่ม destructive): src/app/(paces)/seller/(dashboard)/shop/components/SignOutCard.tsx
 * Base (แถบ error/คำเตือน): src/app/(paces)/seller/(dashboard)/wallet/components/TopUpRequestModal.tsx
 *   (bg-danger/10 border-danger/30)
 * Reuse: revokePushToken — ตรรกะเดียวกับ SignOutCard.tsx (ดูเหตุผลของลำดับที่ comment ของฟังก์ชัน)
 *
 * Spec: docs/superpowers/specs/2026-08-04-account-deletion-design.md §10
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { signOut } from 'next-auth/react'

import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { ACCOUNT_DELETE_ERROR, type DeletionPreflight } from '@/lib/account-deletion'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'

/** error code จาก POST /api/account/delete → ข้อความไทย (map ที่เดียว ไม่กระจายใน handler) */
const DELETE_ERROR_MESSAGE: Record<string, string> = {
  [ACCOUNT_DELETE_ERROR.CONFIRM_MISMATCH]: 'ชื่อที่พิมพ์ไม่ตรง กรุณาตรวจสอบอีกครั้ง',
  [ACCOUNT_DELETE_ERROR.HAS_BLOCKERS]: 'ยังมีรายการค้างอยู่ — จัดการให้เรียบร้อยก่อนจึงจะลบได้',
  [ACCOUNT_DELETE_ERROR.ALREADY_DELETED]: 'บัญชีนี้ถูกลบไปแล้ว',
  [ACCOUNT_DELETE_ERROR.NOT_FOUND]: 'ไม่พบบัญชี',
}

/** สิ่งที่จะเกิดขึ้นเมื่อกดลบ — เขียนเป็นข้อ ๆ ให้ผู้ใช้เห็นภาพก่อนตัดสินใจ ไม่ใช่ย่อหน้ายาว */
const CONSEQUENCES = [
  { icon: 'lock', text: 'เข้าสู่ระบบไม่ได้อีกทันที ทุกช่องทาง' },
  { icon: 'building-store', text: 'ร้านของคุณจะหายจากหน้าค้นหาและลิงก์สาธารณะ' },
  { icon: 'bell-off', text: 'หยุดรับการแจ้งเตือนทุกเครื่องที่เคยเข้าใช้งาน' },
  { icon: 'users-group', text: 'ออกจากร้านที่เคยถูกเชิญไปเป็นพนักงาน' },
]

export default function DeleteAccountCard() {
  const [open, setOpen] = useState(false)
  // ตรึงหน้าข้างหลังขณะโมดัลเปิด — controlled modal ไม่ได้ของนี้จาก Preline (ดู useLockBodyScroll)
  useLockBodyScroll(open)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [preflight, setPreflight] = useState<DeletionPreflight | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const launcherRef = useRef<HTMLButtonElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)

  // โหลด preflight ทุกครั้งที่เปิด (ไม่ cache) — ออเดอร์ค้างเปลี่ยนได้ตลอดเวลา
  // ผู้ใช้ที่เปิดโมดัลค้างไว้แล้วเพิ่งปิดออเดอร์เสร็จ ควรเห็นสถานะใหม่เมื่อเปิดอีกครั้ง
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setErrorMsg('')
    // server เป็นคนบอกว่าต้องพิมพ์อะไร (ชื่อที่แสดงของเจ้าของบัญชี) — client ไม่เดาเอง
    fetch('/api/account/delete', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error('preflight failed')
        return (await res.json()) as DeletionPreflight
      })
      .then((data) => {
        if (!cancelled) setPreflight(data)
      })
      .catch(() => {
        if (!cancelled) setErrorMsg('โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  // ปิดด้วย Esc — โมดัลนี้ controlled ไม่ได้ผ่าน Preline จึงต้องผูกเอง (เหมือน InviteLinkModal)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, submitting])

  // ย้ายโฟกัสเข้าโมดัลตอนเปิด คืนให้ปุ่มเดิมตอนปิด — controlled modal ไม่ได้ทำให้ฟรีเหมือน Preline
  useEffect(() => {
    if (open) closeRef.current?.focus()
    else launcherRef.current?.focus()
  }, [open])

  const handleClose = () => {
    if (submitting) return
    setOpen(false)
    setConfirmText('')
    setErrorMsg('')
  }

  /**
   * ถอน push token ของเครื่องนี้ก่อนลบบัญชี
   *
   * 🛑 ต้องยิง "ก่อน" POST /api/account/delete เสมอ — endpoint auth ด้วย session cookie
   * ถ้ายิงหลังบัญชีถูกปิดจะได้ 401 แล้ว token ค้างในฐาน (เหตุผลเดียวกับ SignOutCard.tsx)
   *
   * ฝั่ง server ลบ PushToken ทุกแถวให้อยู่แล้วใน transaction เดียวกับการปิดบัญชี — ตัวนี้เป็น
   * ชั้นเสริมที่ทำงานเร็วกว่า (ไม่ต้องรอ transaction) และครอบกรณีที่ transaction ล้มกลางทาง
   *
   * ผลข้างเคียงที่ยอมรับ: ถ้า POST ล้มทีหลัง (เช่น server ตรวจซ้ำแล้วเจอออเดอร์ใหม่เข้ามา)
   * ผู้ใช้จะเสียการแจ้งเตือนไปชั่วคราวทั้งที่บัญชียังอยู่ — หายเองเมื่อโหลดหน้าใหม่ เพราะ
   * SellerWebView ฉีดสคริปต์ลงทะเบียน token ทุกครั้งที่หน้าโหลดเสร็จ (ดู buildPushScript)
   * สลับลำดับไม่ได้: หลังบัญชีถูกปิด cookie ใช้ไม่ได้แล้ว DELETE จะได้ 401 แล้ว token
   * ค้างในฐานถาวร ซึ่งแย่กว่ามาก (เครื่องเก่าได้ noti ของบัญชีที่ลบไปแล้ว)
   *
   * timeout 2 วิ + กลืน error: เน็ตช้าต้องไม่ทำให้ปุ่มลบค้าง
   */
  const revokePushToken = async () => {
    const token = (window as unknown as { __DEEP_PUSH_TOKEN__?: string }).__DEEP_PUSH_TOKEN__
    if (!token) return
    try {
      await Promise.race([
        fetch('/api/seller/push-token', {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        }),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ])
    } catch {
      // เงียบ — ดูเหตุผลใน comment ด้านบน
    }
  }

  const handleDelete = async () => {
    setSubmitting(true)
    setErrorMsg('')
    try {
      await revokePushToken()
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmText }),
      })

      if (res.ok) {
        pacesToast.success('ลบบัญชีเรียบร้อย')
        // callbackUrl เดียวกับ SignOutCard — ไม่แตกทางออกเป็นสองแบบ
        signOut({ callbackUrl: '/auth/sign-in' })
        return
      }

      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        blockers?: DeletionPreflight['blockers']
      }
      // 409 HAS_BLOCKERS ส่ง blockers ล่าสุดกลับมาด้วย — อัปเดตรายการในโมดัลทันที
      // ผู้ใช้จะได้เห็นว่ามีอะไรเพิ่งเข้ามาระหว่างที่โมดัลเปิดค้าง ไม่ต้องปิดแล้วเปิดใหม่
      if (data.blockers && preflight) {
        setPreflight({ ...preflight, blockers: data.blockers, canDelete: data.blockers.length === 0 })
      }
      setErrorMsg(DELETE_ERROR_MESSAGE[data.error ?? ''] ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    } catch {
      setErrorMsg('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSubmitting(false)
    }
  }

  const blockers = preflight?.blockers ?? []
  const warnings = preflight?.warnings ?? []
  const confirmLabel = preflight?.confirmLabel ?? ''
  // ปุ่มกดได้เมื่อ: โหลดเสร็จ + ไม่มีตัวบล็อก + พิมพ์ตรง (เทียบแบบเดียวกับ server: trim + ไม่สนพิมพ์ใหญ่เล็ก)
  const canSubmit =
    !!preflight &&
    preflight.canDelete &&
    confirmText.trim().toLocaleLowerCase('th') === confirmLabel.trim().toLocaleLowerCase('th') &&
    !submitting

  return (
    <>
      {/* mt-4 เท่ากับการ์ด "วิธีเข้าสู่ระบบ" ที่อยู่เหนือขึ้นไป — เรียงเป็นชุดเดียวกัน
          ไม่ใส่ -mx-4 (ต่างจากตอนอยู่ที่ /shop): หน้า /account ห่อเนื้อหาด้วย max-w-2xl ธรรมดา
          ไม่ได้อยู่ใน edge-to-edge pattern ของ CommandCenter ที่ต้องหักล้าง gutter ของ shell */}
      <div className="card mt-4">
        {/* header โทน danger — ต่างจากการ์ดอื่นที่ใช้ bg-light/15 border-default-300 โดยตั้งใจ
            ผู้ใช้ต้องแยกออกตั้งแต่ยังไม่อ่านว่าโซนนี้ไม่เหมือนโซนตั้งค่าทั่วไป */}
        <div className="card-header">
          <h5 className="bg-danger/10 border-danger/30 text-danger flex w-full items-center justify-center gap-1.5 rounded border border-dashed p-1.25 text-sm font-medium">
            <Icon icon="alert-triangle" aria-hidden="true" />
            โซนอันตราย
          </h5>
        </div>
        <div className="card-body">
          <p className="text-default-500 mb-3 text-sm">
            ลบบัญชีและร้านค้าของคุณออกจาก Deep อย่างถาวร — ทำแล้วย้อนกลับไม่ได้
          </p>
          {/* py-3 ให้ tap target ≥44px ตาม mobile baseline; โทนเดียวกับปุ่มออกจากระบบโดยตั้งใจ
              ปุ่มทึบแดงเต็มสงวนไว้ในโมดัลซึ่งเป็นจุดตัดสินใจจริง (mirror SignOutCard) */}
          <button
            ref={launcherRef}
            type="button"
            onClick={() => setOpen(true)}
            className="btn bg-danger/15 text-danger hover:bg-danger w-full justify-center gap-1.5 py-3 hover:text-white"
          >
            <Icon icon="trash" className="text-lg" />
            ลบบัญชี
          </button>
        </div>
      </div>

      {open && (
        <div
          className="size-full fixed top-0 start-0 z-80 overflow-x-hidden overflow-y-auto bg-black/50 flex items-start sm:items-center py-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="deleteAccountModalLabel"
          tabIndex={-1}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose()
          }}
        >
          <div
            className={[
              'ease-in-out transition-all duration-200 lg:max-w-lg md:max-w-md md:w-full m-3 md:mx-auto flex items-center',
              'w-[calc(100%-24px)]', // HR7 carve-out: คู่กับ m-3 = เว้นขอบจอ 12px ซ้าย/ขวาบนมือถือ — Paces ไม่มี token "เต็มจอลบระยะขอบ"; ค่าเดียวกับโมดัลอื่นทุกตัวในโปรเจกต์
            ].join(' ')}
          >
            <div className="w-full flex flex-col card pointer-events-auto">
              {/* ─── Header ─────────────────────────────────────────────── */}
              <div className="card-header p-5">
                <h3
                  id="deleteAccountModalLabel"
                  className="font-medium text-sm inline-flex items-center gap-2"
                >
                  <Icon icon="trash" className="text-danger text-lg" aria-hidden="true" />
                  ลบบัญชีถาวร
                </h3>
                <button
                  ref={closeRef}
                  type="button"
                  aria-label="ปิด"
                  onClick={handleClose}
                  disabled={submitting}
                  className="disabled:opacity-40"
                >
                  <Icon icon="x" className="text-2xl align-middle text-default-600" />
                </button>
              </div>

              {/* ─── Body ───────────────────────────────────────────────── */}
              <div className="card-body overflow-y-auto space-y-5">
                {loading && (
                  <div className="text-default-500 flex items-center justify-center gap-2 py-6 text-sm">
                    {/* border spinner — Base: theme/paces/Admin/TS/src/app/(admin)/ui/spinners/page.tsx */}
                    <span className="border-primary size-5 animate-spin rounded-full border-3 border-t-transparent" />
                    กำลังตรวจสอบบัญชี
                  </div>
                )}

                {!loading && preflight && (
                  <>
                    {/* ตัวบล็อก — ต้องเคลียร์ก่อนถึงจะลบได้ มาก่อนทุกอย่างเพราะเป็นสิ่งที่ต้องทำต่อ */}
                    {blockers.length > 0 && (
                      <div className="bg-danger/10 border-danger/30 rounded border p-4">
                        <p className="text-danger mb-2 flex items-center gap-1.5 text-sm font-medium">
                          <Icon icon="alert-circle" aria-hidden="true" />
                          ยังลบไม่ได้
                        </p>
                        <ul className="space-y-3">
                          {blockers.map((b) => (
                            <li key={b.code}>
                              <p className="text-default-700 text-sm">{b.message}</p>
                              {b.actionHref && (
                                <Link
                                  href={b.actionHref}
                                  className="text-danger mt-1 inline-flex items-center gap-1 text-sm font-medium"
                                >
                                  {b.actionLabel ?? 'ไปจัดการ'}
                                  <Icon icon="chevron-right" aria-hidden="true" />
                                </Link>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* สิ่งที่จะเกิดขึ้น — แสดงเสมอ ไม่ว่าจะลบได้หรือไม่ */}
                    <div>
                      <p className="text-default-800 mb-2 text-sm font-medium">เมื่อลบแล้ว</p>
                      <ul className="space-y-2">
                        {CONSEQUENCES.map((c) => (
                          <li key={c.icon} className="text-default-600 flex items-start gap-2 text-sm">
                            <Icon icon={c.icon} className="text-default-400 mt-0.5" aria-hidden="true" />
                            {c.text}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* คำเตือน — ลบได้ แต่ต้องรู้ว่าจะเสียอะไร (สีเหลือง ไม่ใช่แดง — ไม่ได้ห้าม) */}
                    {warnings.length > 0 && (
                      <div className="bg-warning/10 border-warning/30 rounded border p-4">
                        <ul className="space-y-1.5">
                          {warnings.map((w) => (
                            <li key={w.code} className="text-default-700 flex items-start gap-2 text-sm">
                              <Icon icon="alert-triangle" className="text-warning mt-0.5" aria-hidden="true" />
                              {w.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* ระยะเก็บข้อมูล — ตอบคำถาม "ข้อมูลฉันหายไปไหน" ตรง ๆ ก่อนที่ผู้ใช้จะต้องถาม */}
                    <p className="text-default-500 text-sm">
                      ข้อมูลส่วนตัวจะถูกล้างออกจากระบบภายใน 30 วัน
                      ส่วนประวัติคำสั่งซื้อจะถูกเก็บไว้แบบไม่ระบุตัวตนตามกฎหมาย
                      เพื่อไม่ให้ประวัติของผู้ซื้อที่เคยซื้อกับคุณเสียหาย
                    </p>

                    {/* ช่องยืนยัน — ซ่อนเมื่อมีตัวบล็อก เพราะพิมพ์ไปก็กดไม่ได้ รกเปล่า ๆ */}
                    {blockers.length === 0 && (
                      <div>
                        <label htmlFor="deleteConfirmInput" className="text-default-800 mb-1.5 block text-sm">
                          พิมพ์{' '}
                          <span className="text-danger font-medium">{confirmLabel}</span>{' '}
                          เพื่อยืนยัน
                        </label>
                        <input
                          id="deleteConfirmInput"
                          type="text"
                          className="form-input"
                          value={confirmText}
                          onChange={(e) => setConfirmText(e.target.value)}
                          disabled={submitting}
                          autoComplete="off"
                          placeholder={confirmLabel}
                        />
                      </div>
                    )}
                  </>
                )}

                {errorMsg && (
                  <div className="bg-danger/10 border-danger/30 text-danger rounded border p-3 text-sm">
                    {errorMsg}
                  </div>
                )}
              </div>

              {/* ─── Footer ─────────────────────────────────────────────── */}
              <div className="card-footer flex justify-end gap-2 p-5">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={submitting}
                  className="btn bg-light hover:text-default-800 disabled:opacity-40"
                >
                  ยกเลิก
                </button>
                {/* ปุ่มทึบแดงเต็ม — จุดตัดสินใจจริงอยู่ตรงนี้ที่เดียว */}
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={!canSubmit}
                  className="btn bg-danger hover:bg-danger-hover inline-flex items-center gap-1.5 text-white disabled:opacity-40"
                >
                  {submitting && (
                    <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  )}
                  ลบบัญชีถาวร
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
