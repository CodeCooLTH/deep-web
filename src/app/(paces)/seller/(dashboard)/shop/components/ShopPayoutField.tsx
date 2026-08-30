'use client'

/**
 * ShopPayoutField — การ์ด "บัญชีรับเงิน" ของร้าน (feature 00062, U19/A6, TFR-009/TFR-010)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/hrm/staff-add/components/Bank.tsx
 *   (grid grid-cols-1 md:grid-cols-3 gap-x-base gap-y-5 + form-label/form-input) — ตัดฟิลด์ที่
 *   ไม่เกี่ยว (IFSC/Branch/Tax ID/Salary/Payment Mode/PF/ESI) เหลือ ธนาคาร/เลขบัญชี/ชื่อบัญชี/พร้อมเพย์
 * Base (โครงการ์ด .card/.card-header/badge): orders/[token]/components/CodCard.tsx
 *
 * ธนาคาร: UX spec §A6 เขียนว่า "free text ตาม precedent Bank.tsx/ReportForm.tsx" แต่ contract
 * (PATCH /api/shops/payout, UpdateShopPayoutSchema) ล็อก payoutBankCode เป็น picklist จาก
 * THAI_BANK_CODES และ THAI_BANKS มีอยู่แล้วใน shop-payout.ts — เลือกใช้ <select> ตาม contract
 * (ยิง free text เข้า field ที่ backend ปฏิเสธด้วย VALIDATION_ERROR ทุกครั้งไม่มีประโยชน์อะไร)
 *
 * ยิง PATCH ทันทีที่กด "บันทึกการเปลี่ยนแปลง" — ไม่รอปุ่มบันทึกหลักของ ShopForm (pattern เดียวกับ
 * ShopSlugField/ShopLocationField: การ์ดเสริมที่มี submit endpoint ของตัวเอง)
 *
 * ตั้งครั้งแรก (hasExistingPayout=false) = บันทึกได้เลย **ไม่ส่ง `reauth` ไปเลย**
 * (`UpdateShopPayoutSchema.reauth` เป็น optional โดยตั้งใจ) — service ตัดสินจาก
 * `Shop.payoutUpdatedAt` ของตัวเอง ไม่ใช่จากสิ่งที่ client บอก
 *
 * 🛑 เดิมที่นี่ส่ง **รหัสผ่านปลอมเป็นสตริงคงที่** เพื่อให้ผ่าน schema ที่ตอนนั้นบังคับ `reauth`
 * — ถอดออกแล้ว 2026-08-29 พร้อมทำ schema เป็น optional และให้ service ปฏิเสธ 401 เมื่อ
 * "ไม่ใช่ครั้งแรกแต่ไม่ส่ง reauth มา" (fail-closed) magic string ที่หน้าตาเหมือน credential
 * อันตรายกว่าที่เห็น: วันที่มีคนทำให้ service ตรวจ reauth ทุกครั้ง การตั้งบัญชีครั้งแรกจะพัง
 * ทันทีโดยไม่มีใครเดาถูกว่าทำไม
 *
 * แก้ไขบัญชีที่มีอยู่แล้ว (hasExistingPayout=true) = ต้องผ่าน `pacesConfirmWithPassword` ก่อน
 * (BR-BANK-02) — ยิง fetch จริงอยู่ *ในตัวโมดัล* ผ่าน `run()` เพื่อให้ REAUTH_FAILED ขึ้น error
 * ในโมดัลเองโดยไม่ปิดโมดัล (ผู้ใช้กรอกรหัสผ่านใหม่ได้ทันที) — ค่าฟอร์มทั้ง 4 ช่องเป็น useState
 * แยกจากโมดัล จึงไม่มีทางหายแม้กดยกเลิก Sweet Alert กลางทาง
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirmWithPassword } from '@/lib/paces-swal'
import {
  THAI_BANKS,
  normalizePayoutAccountNo,
  isValidPayoutAccountNo,
  isValidPromptPayId,
} from '@/lib/shop-payout'

type Props = {
  payoutBankCode: string | null
  payoutAccountNo: string | null
  payoutAccountName: string | null
  payoutPromptPayId: string | null
  /** true = เคยตั้งบัญชีมาแล้ว (`Shop.payoutUpdatedAt !== null`) — เปลี่ยนต้อง reauth */
  hasExistingPayout: boolean
}

type PayoutResponse = {
  payoutBankCode: string | null
  payoutAccountNo: string | null
  payoutAccountName: string | null
  payoutPromptPayId: string | null
  payoutUpdatedAt: string
}

type FieldErrors = { accountNo?: string; accountName?: string; promptPayId?: string }

export default function ShopPayoutField({
  payoutBankCode,
  payoutAccountNo,
  payoutAccountName,
  payoutPromptPayId,
  hasExistingPayout,
}: Props) {
  const router = useRouter()
  const [bankCode, setBankCode] = useState(payoutBankCode ?? '')
  const [accountNo, setAccountNo] = useState(payoutAccountNo ?? '')
  const [accountName, setAccountName] = useState(payoutAccountName ?? '')
  const [promptPayId, setPromptPayId] = useState(payoutPromptPayId ?? '')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)
  // เริ่มจาก prop แล้วอัปเดตเองหลังบันทึกสำเร็จ — ไม่รอ router.refresh() กลับมา (เหตุผลเดียวกับ
  // ShopForm.tsx: RSC payload ใหม่มาช้ากว่าที่ผู้ใช้เห็นผล บันทึกครั้งที่สองต้องรู้ทันทีว่า
  // "ตอนนี้มีบัญชีอยู่แล้ว" เพื่อสลับไปขอ reauth ถูก)
  const [existing, setExisting] = useState(hasExistingPayout)

  function validate(): FieldErrors {
    const next: FieldErrors = {}
    const hasNo = accountNo.trim() !== ''
    const hasName = accountName.trim() !== ''
    // กรอกไม่ครบ (มีเลขบัญชีแต่ไม่มีชื่อบัญชี หรือกลับกัน) — inline error ใต้ช่องที่ขาด (UX spec §A6)
    if (hasNo && !hasName) next.accountName = 'กรุณากรอกชื่อบัญชี'
    if (hasName && !hasNo) next.accountNo = 'กรุณากรอกเลขบัญชี'
    if (hasNo && !next.accountNo && !isValidPayoutAccountNo(accountNo)) {
      next.accountNo = 'เลขบัญชีต้องเป็นตัวเลข 10-15 หลัก'
    }
    if (promptPayId.trim() && !isValidPromptPayId(promptPayId.trim())) {
      next.promptPayId = 'PromptPay ID ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลขบัตร ปชช. 13 หลัก'
    }
    return next
  }

  function buildPayload() {
    return {
      payoutBankCode: bankCode || null,
      payoutAccountNo: accountNo.trim() ? normalizePayoutAccountNo(accountNo) : null,
      payoutAccountName: accountName.trim() || null,
      payoutPromptPayId: promptPayId.trim() || null,
    }
  }

  function applySaved(data: PayoutResponse) {
    setBankCode(data.payoutBankCode ?? '')
    setAccountNo(data.payoutAccountNo ?? '')
    setAccountName(data.payoutAccountName ?? '')
    setPromptPayId(data.payoutPromptPayId ?? '')
    setExisting(true)
    setErrors({})
  }

  /** ยิง PATCH จริง — throw ข้อความ (รองรับ HTML) เมื่อไม่สำเร็จ ให้ผู้เรียกตัดสินว่าจะโชว์ที่ไหน */
  /**
   * `reauth` เป็น optional — **ตั้งครั้งแรกไม่ต้องส่ง** (BR-BANK-02)
   *
   * 🛑 ห้ามส่งรหัสผ่านปลอมมาให้ผ่าน schema เด็ดขาด: มันคือ magic string ที่หน้าตาเหมือน
   * credential และวันที่มีคนทำให้ server ตรวจ reauth ทุกครั้ง (ทิศที่ "ปลอดภัยขึ้น")
   * การตั้งบัญชีครั้งแรกจะพังทันทีโดยไม่มีใครเดาถูกว่าทำไม
   *
   * ตัวที่ตัดสินว่าเป็นครั้งแรกจริงไหมคือ `Shop.payoutUpdatedAt` ฝั่ง server — ไม่ใช่ค่านี้
   */
  async function submitPayout(reauth?: { method: 'PASSWORD'; password: string }): Promise<PayoutResponse> {
    const res = await fetch('/api/shops/payout', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...buildPayload(), reauth }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) return data as PayoutResponse
    const message = typeof data?.error === 'string' ? data.error : 'บันทึกไม่สำเร็จ กรุณาลองใหม่'
    // REAUTH_UNAVAILABLE (409) — ไม่ใช่แค่บอกว่าทำไม่ได้ ต้องชี้ทางออกไปตั้งรหัสผ่าน/เพิ่มเบอร์
    // ที่ /account (UX spec §A6) — showValidationMessage ของ sweetalert2 เขียนด้วย innerHTML
    // จึงใส่ลิงก์ได้จริง (ดูคอมเมนต์ pacesConfirmWithPassword ใน paces-swal.ts)
    if (res.status === 409) {
      throw new Error(`${message} — <a href="/account" class="underline">ไปตั้งค่าที่บัญชีของฉัน</a>`)
    }
    throw new Error(message)
  }

  const handleSaveClick = async () => {
    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    if (!existing) {
      // ตั้งครั้งแรก — ไม่ส่ง reauth เลย (server ตัดสินจาก payoutUpdatedAt ของตัวเอง)
      setSaving(true)
      try {
        const updated = await submitPayout()
        applySaved(updated)
        pacesToast.success('บันทึกบัญชีรับเงินแล้ว')
        router.refresh()
      } catch (err) {
        pacesToast.error(err instanceof Error && err.message ? err.message : 'บันทึกไม่สำเร็จ กรุณาลองใหม่')
      } finally {
        setSaving(false)
      }
      return
    }

    // เปลี่ยนบัญชีที่มีอยู่แล้ว — ต้องยืนยันตัวตนด้วยรหัสผ่านก่อน (BR-BANK-02)
    const result = await pacesConfirmWithPassword<PayoutResponse>({
      title: 'ยืนยันตัวตนก่อนเปลี่ยนบัญชีรับเงิน',
      text: 'กรอกรหัสผ่านบัญชีของคุณเพื่อยืนยัน — ป้องกันไม่ให้ใครสวมสิทธิ์เปลี่ยนบัญชีรับเงินของร้าน',
      placeholder: 'รหัสผ่าน',
      confirmButtonText: 'ยืนยันและบันทึก',
      validationMessage: 'กรุณากรอกรหัสผ่าน',
      run: (password) => submitPayout({ method: 'PASSWORD', password }),
    })
    if (!result) return // ยกเลิก/Esc — ค่าในฟอร์มยังอยู่ครบ กดบันทึกใหม่ได้โดยไม่ต้องพิมพ์ซ้ำ
    applySaved(result)
    pacesToast.success('บันทึกบัญชีรับเงินแล้ว')
    router.refresh()
  }

  return (
    <div className="card mt-5">
      <div className="card-header">
        <h4 className="card-title">บัญชีรับเงิน</h4>
        {/* ปรากฏเฉพาะตอนมีบัญชีตั้งไว้แล้ว — ครั้งแรกยังไม่มีอะไรให้สวมสิทธิ์ (UX spec §A6) */}
        {existing && (
          <span className="badge bg-warning/15 text-warning-ink inline-flex items-center gap-1">
            <Icon icon="lock" className="text-xs" aria-hidden="true" />
            ต้องยืนยันตัวตนก่อนแก้
          </span>
        )}
      </div>
      <div className="card-body">
        <div className="grid grid-cols-1 gap-x-base gap-y-5 md:grid-cols-3">
          <div>
            <label htmlFor="payout-bank" className="form-label">
              ธนาคาร
            </label>
            <select
              id="payout-bank"
              className="form-select"
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value)}
              disabled={saving}
            >
              <option value="">-- เลือกธนาคาร --</option>
              {THAI_BANKS.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.nameTh}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="payout-account-no" className="form-label">
              เลขบัญชี
            </label>
            <input
              id="payout-account-no"
              type="text"
              inputMode="numeric"
              className="form-input"
              placeholder="123-4-56789-0"
              value={accountNo}
              onChange={(e) => setAccountNo(e.target.value)}
              disabled={saving}
              aria-invalid={Boolean(errors.accountNo)}
              aria-describedby={errors.accountNo ? 'payout-account-no-error' : undefined}
            />
            {errors.accountNo && (
              <p id="payout-account-no-error" className="text-danger mt-1 text-sm">
                {errors.accountNo}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="payout-account-name" className="form-label">
              ชื่อบัญชี
            </label>
            <input
              id="payout-account-name"
              type="text"
              className="form-input"
              placeholder="ชื่อบัญชีตามสมุดธนาคาร"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              disabled={saving}
              aria-invalid={Boolean(errors.accountName)}
              aria-describedby={errors.accountName ? 'payout-account-name-error' : undefined}
            />
            {errors.accountName && (
              <p id="payout-account-name-error" className="text-danger mt-1 text-sm">
                {errors.accountName}
              </p>
            )}
          </div>

          <div className="md:col-span-3">
            <label htmlFor="payout-promptpay" className="form-label">
              หมายเลขพร้อมเพย์ <span className="text-default-400 text-xs">(ไม่บังคับ)</span>
            </label>
            <input
              id="payout-promptpay"
              type="text"
              className="form-input"
              placeholder="081-234-5678"
              value={promptPayId}
              onChange={(e) => setPromptPayId(e.target.value)}
              disabled={saving}
              aria-invalid={Boolean(errors.promptPayId)}
              aria-describedby={errors.promptPayId ? 'payout-promptpay-error' : 'payout-promptpay-help'}
            />
            {errors.promptPayId ? (
              <p id="payout-promptpay-error" className="text-danger mt-1 text-sm">
                {errors.promptPayId}
              </p>
            ) : (
              <p id="payout-promptpay-help" className="text-default-400 mt-1 text-sm">
                ใส่แล้วลูกค้าจะเห็น QR ให้สแกนจ่ายในหน้าออเดอร์
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={handleSaveClick}
            disabled={saving}
            className="btn bg-primary hover:bg-primary-hover min-h-11 inline-flex w-full items-center justify-center gap-2 text-white disabled:opacity-50 md:w-auto"
          >
            {saving ? (
              <>
                <Icon icon="loader-2" className="animate-spin" aria-hidden="true" />
                กำลังบันทึก...
              </>
            ) : (
              <>
                <Icon icon="device-floppy" aria-hidden="true" />
                บันทึกการเปลี่ยนแปลง
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
