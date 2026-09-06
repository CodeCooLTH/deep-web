/**
 * PlanStatusCard — การ์ดบนสุดของหน้าแผนการตรวจสอบ (feature 00060 · T12)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/categories/components/AddCategoryModal.tsx
 *   (โครง .card > .card-header + .card-body) ผ่าน src/app/(paces)/seller/(dashboard)/verification/page.tsx
 *   ที่ re-source โครงเดียวกันมาแล้ว (สรุปสถานะ + icon-circle + ปุ่ม action)
 *
 * 🛑 ข้อความยกเลิก/ผลลัพธ์การยกเลิก ต้องมาจาก `cancelInspectionNoticeTh()` เท่านั้น (HR16) —
 *    ทั้งแถบแจ้งเตือนถาวรตอน effectiveAt ถูกตั้งแล้ว และตอนแจ้งผลหลังกดยืนยัน ห้ามพิมพ์คำใหม่
 */
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import { formatBaht } from '@/lib/format-money'
import { formatDate } from '@/lib/format-date'
import { INSPECTION_STEP_LABEL_TH } from '@/lib/inspection/checks'
import { INSPECTION_MONTHLY_PRICE_BAHT, INSPECTION_PRICING_IS_DRAFT } from '@/lib/inspection/pricing'
import { cancelInspectionNoticeTh } from '@/lib/inspection/copy'
import { pacesConfirmAsync, pacesAlert } from '@/lib/paces-swal'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import type { InspectionPlanJSON } from './types'

// ราคาที่โผล่บนจอถูกบล็อกด้วย flag เดียวกับที่ endpoint ใช้ (assertInspectionPricingDecided) —
// dev/เทสยังต้องเห็นราคาจริงเพื่อพิสูจน์ flow ทั้งเส้น ส่วน production ที่ยังไม่มีมติราคา
// ต้องไม่โผล่ตัวเลขว่างเปล่า (UX edge state: "ราคาจะประกาศเร็ว ๆ นี้")
const PRICING_BLOCKED = INSPECTION_PRICING_IS_DRAFT && process.env.NODE_ENV === 'production'

/**
 * 🛑 เหตุผลของ `RENEWAL_FAILED` มีคำเชิญให้เติมเครดิตอยู่ในตัว ⇒ ต้องผันตาม `hidePayments`
 *    เหมือนคำเชิญอื่น (App Store 3.1.1) — จุดนี้หลุดด่านของเทส [blocker] ได้เพราะเทสตรวจแค่ว่า
 *    "ไฟล์นี้มีคำว่า hidePayments ไหม" ไม่ได้ตรวจว่ากั้นครบทุกจุดในไฟล์
 */
const reasonLabel = (reason: string, hidePayments: boolean): string | undefined =>
  reason === 'OWNER_CANCELLED'
    ? 'ยกเลิกโดยเจ้าของร้าน'
    : reason === 'RENEWAL_FAILED'
      ? hidePayments
        ? 'ต่ออายุไม่สำเร็จ (เครดิตไม่พอ) — จัดการการชำระเงินได้จากเว็บไซต์ Deep'
        : 'ต่ออายุไม่สำเร็จ (เครดิตไม่พอ) — เติมเครดิตแล้วสมัครใหม่ได้'
      : undefined

type Props = {
  plan: InspectionPlanJSON
  canManage: boolean
  /** 🛑 ในแอปผู้ขาย (App Store 3.1.1) ห้ามมีคำเชิญให้จ่ายเงิน — ข้อมูล/สถานะยังแสดงครบ */
  hidePayments?: boolean
}

export default function PlanStatusCard({ plan, canManage, hidePayments = false }: Props) {
  const router = useRouter()
  const [cancelError, setCancelError] = useState<string | null>(null)

  const handleCancel = async () => {
    setCancelError(null)
    // 🛑 ไม่รู้ effectiveAt ที่แท้จริงก่อนยิง API (คำนวณจาก nextRenewalAt ฝั่ง server เท่านั้น —
    //    ไม่มีใน payload ของ GET) ⇒ ข้อความก่อนยืนยันพูดหลักการกว้าง ๆ โดยไม่ปักวันที่ที่ยังไม่รู้
    //    ผลลัพธ์จริงพร้อมวันที่แสดงหลังยืนยันเท่านั้น (มาจาก cancelInspectionNoticeTh ที่ server
    //    คืนกลับมา — ข้อความเดียวกับที่ endpoint ตอบ ไม่พิมพ์ใหม่)
    const result = await pacesConfirmAsync<{ effectiveAt: string; notice: string }>({
      title: 'ยกเลิกแผนการตรวจสอบ?',
      text: 'ค่าตรวจที่ชำระไปแล้วไม่มีการคืนเงินไม่ว่ากรณีใด และแผนจะมีผลใช้งานต่อจนถึงสิ้นรอบบิลปัจจุบัน ประวัติรอบตรวจเดิมจะยังแสดงอยู่ครบ',
      confirmSemantic: 'warning',
      icon: 'warning',
      confirmButtonText: 'ยกเลิกแผน',
      errorText: 'ยกเลิกแผนไม่สำเร็จ ลองใหม่อีกครั้ง',
      run: async () => {
        const res = await fetch('/api/seller/inspection/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ acknowledged: true }),
        })
        const body = await res.json().catch(() => null)
        if (!res.ok) throw new Error(body?.message ?? 'CANCEL_FAILED')
        return { effectiveAt: body.plan.effectiveAt as string, notice: body.notice as string }
      },
    })

    if (result === null) return // ผู้ใช้กดยกเลิก/Esc

    await pacesAlert({
      title: 'แจ้งยกเลิกแผนแล้ว',
      // ข้อความเดียวกับที่ server คืนมา (cancelInspectionNoticeTh ที่ route เรียกอยู่แล้ว) —
      // ไม่ประกอบข้อความใหม่ที่นี่ (HR16: สองที่เขียนเองจะกลายเป็นคำสัญญาสองแบบ)
      text: result.notice,
      icon: 'success',
    })
    router.refresh()
  }

  if (plan === null) {
    return (
      <div className="card">
        <div className="card-header">
          <h4 className="card-title">แผนการตรวจสอบ</h4>
        </div>
        <div className="card-body">
          {/* 🛑 คำสั่งต้องทำตามได้จริง — ตอนราคายังไม่เคาะ ทั้งหน้าไม่มีปุ่มให้กดสักปุ่ม
              (ทุกขั้นถูกปิดที่ StepLadder) การบอกว่า "เลือกขั้นด้านล่างเพื่อเริ่มสมัคร" จึงเป็น
              คำสั่งที่ผู้ใช้ทำตามไม่ได้ แล้วเขาจะเลื่อนหาปุ่มที่ไม่มีอยู่จริง */}
          <SellerEmptyState
            compact
            icon="shield-check"
            title={PRICING_BLOCKED ? 'ยังไม่เปิดรับสมัคร' : 'ยังไม่ได้อยู่ในแผนการตรวจสอบ'}
            description={
              PRICING_BLOCKED
                ? 'แผนการตรวจสอบยังไม่เปิดให้สมัครในขณะนี้ — ดูรายละเอียดของแต่ละขั้นได้ด้านล่าง'
                : 'เลือกขั้นการตรวจสอบด้านล่างเพื่อเริ่มสมัคร'
            }
          />
        </div>
      </div>
    )
  }

  const stepLabel = INSPECTION_STEP_LABEL_TH[plan.step]
  const monthlyPrice = INSPECTION_MONTHLY_PRICE_BAHT[plan.step]
  const isLapsed = plan.status === 'LAPSED'
  const cancelPending = plan.status === 'ACTIVE' && plan.effectiveAt !== null
  // 🛑 ค้างชำระ = ยังใช้งานได้อยู่ แต่มีเส้นตาย — ต้องบอก **จำนวนวันที่เหลือ** ไม่ใช่แค่คำว่า
  //    "ค้างชำระ" ลอย ๆ (AC-INS-08-3) · เลขมาจาก server ห้ามให้หน้าจอคิดเอง
  const inGrace = !isLapsed && plan.graceUntil !== null

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">แผนการตรวจสอบ</h4>
        <span
          className={cn(
            'badge',
            // 🛑 Verified-Means-Green: ACTIVE ไม่ใช่ "ผ่าน" ห้ามใช้เขียว — ใช้ primary (สถานะกลาง)
            // soft badge ต้องเป็น text-{color}-ink เสมอ (§6 component reference — text-primary
            // เปล่าบน bg-primary/15 ตกคอนทราสต์)
            isLapsed ? 'bg-default-200 text-default-700' : 'bg-primary/15 text-primary-ink',
          )}
        >
          {isLapsed ? 'ไม่ได้อยู่ในแผนแล้ว' : 'กำลังใช้งาน'}
        </span>
      </div>
      <div className="card-body">
        {inGrace && (
          <div className="bg-warning/15 mb-3 flex items-start gap-2 rounded-lg p-3">
            <Icon icon="alert-triangle" className="text-warning-ink mt-0.5 size-4 shrink-0" />
            <p className="text-warning-ink text-sm">
              ค้างชำระค่าตรวจ — เหลือเวลาอีก {plan.graceDaysLeft} วัน
              (ถึง {formatDate(plan.graceUntil)})
              {hidePayments
                ? ' จัดการการชำระเงินได้จากเว็บไซต์ Deep'
                : ' เติมเงินในกระเป๋าร้านแล้วระบบจะตัดให้อัตโนมัติ'}
              {' '}ระหว่างนี้ป้ายบนโปรไฟล์ยังแสดงตามปกติ
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-primary/10 flex size-9 shrink-0 items-center justify-center rounded-full">
            <Icon icon="shield-check" className="text-primary size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-default-900 truncate text-base font-semibold">
              ขั้นปัจจุบัน: {stepLabel}
            </p>
            {!isLapsed && (
              <p className="text-default-400 text-sm">
                {PRICING_BLOCKED ? 'ราคาจะประกาศเร็ว ๆ นี้' : `${formatBaht(monthlyPrice)}/เดือน`}
                {/* วันตัดเงินรอบถัดไป — ร้านต้องรู้ล่วงหน้าว่าจะถูกหักเมื่อไร ไม่ใช่รู้ตอนถูกหักแล้ว
                    · แผนที่แจ้งยกเลิกไว้แล้วไม่แสดงบรรทัดนี้ เพราะแถบด้านล่างบอกวันสิ้นสุดอยู่แล้ว */}
                {!cancelPending && !inGrace && ` · ต่ออายุ ${formatDate(plan.nextRenewalAt)}`}
              </p>
            )}
          </div>
        </div>

        {isLapsed && (
          <div className="mt-4 rounded-lg border border-default-200 bg-default-50 px-4 py-3 text-sm text-default-700">
            ไม่ได้อยู่ในแผนการตรวจสอบต่อเนื่องแล้ว — โปรไฟล์สาธารณะแสดงเป็นแถบสีเทากลาง
            ประวัติรอบตรวจเดิมยังแสดงอยู่ครบ
            {plan.lapsedReason && (
              <p className="mt-1 text-default-500">{reasonLabel(plan.lapsedReason, hidePayments)}</p>
            )}
          </div>
        )}

        {cancelPending && plan.effectiveAt && (
          <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-ink">
            {cancelInspectionNoticeTh(new Date(plan.effectiveAt))}
          </div>
        )}

        {cancelError && (
          <p className="mt-3 text-sm text-danger">{cancelError}</p>
        )}
      </div>

      {!isLapsed && !cancelPending && (
        <div className="card-footer flex justify-end">
          <button
            type="button"
            className="btn text-danger hover:bg-danger hover:text-white"
            disabled={!canManage}
            title={canManage ? undefined : 'เฉพาะเจ้าของร้านเท่านั้นที่จัดการแผนการตรวจสอบได้'}
            onClick={() => {
              handleCancel().catch(() => setCancelError('ยกเลิกแผนไม่สำเร็จ ลองใหม่อีกครั้ง'))
            }}
          >
            <Icon icon="ban" className="size-4" />
            ยกเลิกแผน
          </button>
        </div>
      )}
    </div>
  )
}
