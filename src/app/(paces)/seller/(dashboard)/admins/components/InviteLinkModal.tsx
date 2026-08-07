'use client'

/**
 * InviteLinkModal — ปุ่มระดับหน้า + โมดัลจัดการลิงก์เชิญพนักงานของ /admins
 * (feature 00012 ext — แทนที่ InviteLinkCard.tsx เดิมที่เป็นการ์ดบนหน้า + Swal เลือกอายุ)
 *
 * ทำไมเปลี่ยน: เดิมงานเดียว ("ได้ลิงก์มาส่งให้พนักงาน") กระจายอยู่ 2 ที่ 2 จังหวะ — เลือกอายุใน
 * SweetAlert แล้ว dialog ปิด ค่อยไปหาลิงก์ในการ์ดข้างหลัง; และการ์ดกินพื้นที่เหนือรายชื่อสมาชิก
 * ซึ่งเป็นเนื้อหาหลักของหน้า (บนมือถือต้องเลื่อนผ่านทุกครั้ง). โมดัลรวบ เลือกอายุ → สร้าง →
 * คัดลอก → ยกเลิก ไว้ที่เดียว และคืนหน้าให้เป็นรายชื่อสมาชิกล้วน
 *
 * Base (modal shell): theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/categories/components/AddCategoryModal.tsx
 *   (hs-overlay → card > card-header > card-body) แปลงเป็น controlled open/onClose ตาม in-app
 *   precedent src/app/(paces)/seller/(dashboard)/wallet/components/TopUpRequestModal.tsx
 *   (overlay `size-full fixed … bg-black/50`, กดนอก card = ปิด, error banner bg-danger/10 border-danger/30)
 * Base (radio group): src/app/(paces)/seller/(fullscreen)/auctions/components/AuctionTimeCard.tsx
 *   (`form-radio rounded-full!` + label ข้าง ๆ) ห่อด้วย label การ์ดเพื่อให้ tap target ≥44px
 * Base (empty-state + แถวลิงก์ border-dashed): InviteLinkCard.tsx เดิม (ยกมาทั้งบล็อก)
 * Reuse ตรง ๆ (ห้ามสร้างใหม่):
 *   - CopyLinkButton: src/app/(paces)/seller/(dashboard)/orders/[token]/components/CopyLinkButton.tsx
 *   - RowActionDeleteButton: ../business/[shopId]/invites/components/RowActionDeleteButton.tsx
 *
 * UX Spec: docs/superpowers/specs/2026-08-01-invite-admins-modal-and-accept-mockup.html §A1-A2
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { formatDate } from '@/lib/format-date'
import { pacesToast } from '@/lib/paces-toast'
import type { InviteExpiryKey } from '@/lib/invite-link'
import CopyLinkButton from '../../orders/[token]/components/CopyLinkButton'
import RowActionDeleteButton from '../../business/[shopId]/invites/components/RowActionDeleteButton'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'

export interface InviteLinkRow {
  url: string
  slug: string
  expiresAt: string
}

interface InviteLinkModalProps {
  links: InviteLinkRow[]
}

/**
 * ตัวเลือกอายุลิงก์ — ประกาศไว้ที่นี่แทน import INVITE_EXPIRY_OPTIONS จาก '@/lib/invite-link'
 * โดยตั้งใจ: ไฟล์นั้น `import crypto from 'crypto'` ที่ระดับโมดูล ซึ่งลากเข้ามาใน client bundle
 * ไม่ได้ (InviteLinkCard.tsx เดิมก็ hardcode ด้วยเหตุผลเดียวกัน) — ดึงมาเฉพาะ type ที่ถูกลบตอน
 * compile จึงปลอดภัย. key ต้องตรงกับ INVITE_EXPIRY_OPTIONS ฝั่ง server เสมอ
 */
const EXPIRY_CHOICES: { key: InviteExpiryKey; label: string; recommended?: boolean }[] = [
  { key: '24h', label: '24 ชั่วโมง' },
  { key: '7d', label: '7 วัน', recommended: true },
  { key: '30d', label: '30 วัน' },
]

// error code จาก POST /api/shops/current/invite-links (route.ts) → ข้อความไทย
const CREATE_ERROR_MESSAGE: Record<string, string> = {
  NOT_OWNER: 'คุณไม่มีสิทธิ์สร้างลิงก์เชิญ',
  SHOP_LOCKED: 'ธุรกิจนี้ถูกล็อกอยู่ ไม่สามารถสร้างลิงก์เชิญได้',
  NO_ACTIVE_PACKAGE: 'ไม่มีแพ็กเกจที่ใช้งานอยู่',
  VALIDATION_ERROR: 'ข้อมูลไม่ถูกต้อง กรุณาลองใหม่',
}

export default function InviteLinkModal({ links }: InviteLinkModalProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  // ตรึงหน้าข้างหลังขณะโมดัลเปิด — controlled modal ไม่ได้ของนี้จาก Preline (ดู useLockBodyScroll)
  useLockBodyScroll(open)
  const [expiryKey, setExpiryKey] = useState<InviteExpiryKey>('7d')
  const [creating, setCreating] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const launcherRef = useRef<HTMLButtonElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)

  // ปิดด้วย Esc — โมดัลนี้ไม่ได้ผ่าน Preline (controlled) จึงต้องผูกเอง
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !creating) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, creating])

  // ย้ายโฟกัสเข้าโมดัลตอนเปิด และคืนให้ปุ่มเดิมตอนปิด — controlled modal ไม่ได้ทำให้ฟรี
  // เหมือน Preline; ถ้าไม่ทำ ผู้ใช้คีย์บอร์ด/screen reader จะยัง tab อยู่หลังโมดัลทั้งที่มันเปิดค้าง
  useEffect(() => {
    if (open) closeRef.current?.focus()
    else launcherRef.current?.focus()
  }, [open])

  const handleClose = () => {
    if (creating) return
    setErrorMsg('')
    setOpen(false)
  }

  const handleCreate = async () => {
    setCreating(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/shops/current/invite-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiryKey }),
      })
      if (res.ok) {
        pacesToast.success('สร้างลิงก์เชิญสำเร็จ')
        // โมดัลเปิดค้างไว้ — router.refresh() ทำให้ RSC ส่ง links ชุดใหม่ลงมาทาง props
        // ผู้ใช้เห็นลิงก์ที่เพิ่งสร้างโผล่ในลิสต์ทันที ไม่ต้องปิดแล้วเปิดใหม่
        router.refresh()
        return
      }
      const data = await res.json().catch(() => ({}))
      setErrorMsg(CREATE_ERROR_MESSAGE[data?.error as string] ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    } catch {
      setErrorMsg('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-sm bg-primary text-white hover:bg-primary-hover inline-flex items-center gap-1.5"
      >
        <Icon icon="link" aria-hidden="true" />
        ลิงก์เชิญพนักงาน
      </button>

      {open && (
        /* overlay — copy โครงจาก TopUpRequestModal.tsx (controlled แทน data-hs-overlay) */
        <div
          className="size-full fixed top-0 start-0 z-80 overflow-x-hidden overflow-y-auto bg-black/50 flex items-start sm:items-center py-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="inviteLinkModalLabel"
          tabIndex={-1}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose()
          }}
        >
          <div
            className={[
              'ease-in-out transition-all duration-200 lg:max-w-lg md:max-w-md md:w-full m-3 md:mx-auto flex items-center',
              'w-[calc(100%-24px)]', // HR7 carve-out: คู่กับ m-3 = เว้นขอบจอ 12px ซ้าย/ขวาบนมือถือ — Paces ไม่มี token "เต็มจอลบระยะขอบ"; copy ค่าจาก wallet/components/TopUpRequestModal.tsx ให้โมดัลทุกตัวกว้างเท่ากัน
            ].join(' ')}
          >
            <div className="w-full flex flex-col card pointer-events-auto">
              {/* ─── Header ─────────────────────────────────────────────── */}
              <div className="card-header p-5">
                <h3 id="inviteLinkModalLabel" className="font-medium text-sm inline-flex items-center gap-2">
                  <Icon icon="link" className="text-primary text-lg" aria-hidden="true" />
                  ลิงก์เชิญพนักงาน
                </h3>
                <button
                  ref={closeRef}
                  type="button"
                  aria-label="ปิด"
                  onClick={handleClose}
                  disabled={creating}
                  className="disabled:opacity-40"
                >
                  <Icon icon="x" className="text-2xl align-middle text-default-600" />
                </button>
              </div>

              {/* ─── Body ───────────────────────────────────────────────── */}
              <div className="card-body overflow-y-auto space-y-5">
                {errorMsg && (
                  <div
                    role="alert"
                    aria-live="polite"
                    className="flex items-start gap-2 rounded-md bg-danger/10 border border-danger/30 p-3 text-sm text-danger"
                  >
                    <Icon icon="alert-circle" className="shrink-0 text-base mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* ── สร้างลิงก์ใหม่ ─────────────────────────────────────── */}
                <div>
                  <p className="form-label mb-2">อายุลิงก์</p>
                  {/* มือถือเรียงแนวตั้ง (แต่ละตัวเลือกกดง่ายเต็มความกว้าง) → sm ขึ้นไปเรียงแนวนอน 3 ช่อง */}
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {EXPIRY_CHOICES.map((choice) => (
                      <label
                        key={choice.key}
                        htmlFor={`invite-expiry-${choice.key}`}
                        className={`flex flex-1 cursor-pointer items-center gap-2.5 rounded-lg border p-3 text-sm ${
                          expiryKey === choice.key
                            ? 'border-primary bg-primary/5 text-default-900 font-semibold'
                            : 'border-default-300 text-default-700'
                        }`}
                      >
                        <input
                          type="radio"
                          id={`invite-expiry-${choice.key}`}
                          name="invite-expiry"
                          value={choice.key}
                          checked={expiryKey === choice.key}
                          onChange={() => setExpiryKey(choice.key)}
                          disabled={creating}
                          className="form-radio rounded-full!"
                        />
                        <span>{choice.label}</span>
                        {choice.recommended && (
                          <span className="badge bg-primary/15 text-primary text-2xs ms-auto">แนะนำ</span>
                        )}
                      </label>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={creating}
                    className="btn bg-primary text-white hover:bg-primary-hover mt-3 w-full py-3 font-semibold disabled:opacity-60"
                  >
                    {creating ? (
                      <>
                        <span className="border-white me-2 inline-block size-4 animate-spin rounded-full border-2 border-t-transparent" />
                        กำลังสร้างลิงก์...
                      </>
                    ) : (
                      <>
                        <Icon icon="plus" className="me-2" aria-hidden="true" />
                        สร้างลิงก์เชิญ
                      </>
                    )}
                  </button>
                </div>

                {/* ── ลิงก์ที่ใช้งานอยู่ ──────────────────────────────────── */}
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="form-label mb-0">ลิงก์ที่ใช้งานอยู่</p>
                    {links.length > 0 && (
                      <span className="badge bg-default-100 text-default-600 text-2xs">{links.length} ลิงก์</span>
                    )}
                  </div>

                  {links.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-center">
                      <Icon icon="link" className="text-4xl text-default-300" aria-hidden="true" />
                      <p className="text-default-500 font-semibold">
                        ยังไม่มีลิงก์เชิญที่ใช้งานอยู่
                        <br />
                        เลือกอายุแล้วกดสร้างลิงก์ด้านบน
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {links.map((link) => (
                        <div
                          key={link.slug}
                          className="flex flex-col gap-2 rounded-lg border border-default-300 border-dashed p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0 flex-1">
                            <CopyLinkButton value={link.url} showPreview label="คัดลอก" />
                            <p className="text-default-500 text-2xs mt-1.5">
                              หมดอายุ {formatDate(link.expiresAt)} · ใช้ซ้ำได้จนหมดอายุ
                            </p>
                          </div>
                          <RowActionDeleteButton
                            endpoint={`/api/shops/current/invite-links/${link.slug}`}
                            ariaLabel={`ยกเลิกลิงก์เชิญ ${link.slug}`}
                            icon="link-off"
                            confirmTitle="ยกเลิกลิงก์นี้?"
                            confirmText="ลิงก์นี้จะใช้เชิญคนใหม่ไม่ได้อีก (คนที่เข้าร่วมไปแล้วยังเป็นสมาชิกอยู่)"
                            successMessage="ยกเลิกลิงก์เรียบร้อย"
                            errorMessages={{ NOT_OWNER: 'คุณไม่มีสิทธิ์ยกเลิกลิงก์นี้' }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
