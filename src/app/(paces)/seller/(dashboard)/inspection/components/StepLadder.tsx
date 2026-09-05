/**
 * StepLadder — 4 การ์ดขั้นการตรวจสอบ + สมัคร/อัปเกรด (feature 00060 · T12)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/pages/pricing/page.tsx
 *   + theme/paces/Admin/TS/src/app/(admin)/pages/pricing/components/data.ts
 *   ผ่าน src/app/(paces)/seller/(dashboard)/verification/components/LevelCard.tsx ที่ re-source
 *   โครงเดียวกันมาแล้ว (card h-full rounded-md + isPopular → !bg-primary highlight)
 *
 * 🛑 ต่างจาก LevelCard เดิม: UX-Design-Spec.md §Surface B มอบ highlight ให้ "ขั้นปัจจุบัน"
 *    (ไม่ใช่การ์ดที่กดได้ — ตรงข้ามกับที่ /verification ทำ) — คงภาษาภาพเดิม (!bg-primary) แต่
 *    ย้ายไปการ์ดคนละใบตามที่สเปกนี้กำหนด ไม่ก็อป StatusBadge.tsx ของหน้านั้น (ตกคอนทราสต์
 *    ที่รู้อยู่แล้ว) — badge ใหม่ตาม §6 ของ paces-component-reference.md
 */
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import { formatDateTH } from '@/lib/format-date'
import { formatBaht } from '@/lib/format-money'
import { INSPECTION_STEP_LABEL_TH } from '@/lib/inspection/checks'
import type { InspectionStep } from '@/lib/inspection/checks'
import {
  INSPECTION_MONTHLY_PRICE_BAHT,
  INSPECTION_SETUP_FEE_BAHT,
  INSPECTION_PRICING_IS_DRAFT,
  subscribeChargeBaht,
  upgradeChargeBaht,
} from '@/lib/inspection/pricing'
import { pacesConfirmTerms } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import type { InspectionPlanJSON, IntakeJSON } from './types'

const STEPS: InspectionStep[] = [1, 2, 3, 4]

const PRICING_BLOCKED = INSPECTION_PRICING_IS_DRAFT && process.env.NODE_ENV === 'production'

// เนื้อหาเงื่อนไข — มิเรอร์คำจาก UX-Design-Spec.md §Content outline (Surface B) คำต่อคำ
// 🛑 ห้ามแก้คำในไฟล์นี้เพียงลำพัง — ถ้าจะเปลี่ยนคำ ต้องเช็ค Content outline ในสเปกด้วยว่ายังตรงกัน
function termsHtml(amountBaht: number): string {
  return `
    <p class="text-start">ระบบจะเรียกเก็บ <strong>${formatBaht(amountBaht)}</strong> จากกระเป๋าเครดิตของร้านทันที</p>
    <p class="mt-2 text-start">ค่าตรวจนี้ไม่คืนเงิน ไม่ว่าผลตรวจจะเป็นอย่างไร</p>
    <p class="mt-2 text-start">หากพบหลักฐานฉ้อโกงระหว่างตรวจ ร้านจะถูกนำเข้าสู่กระบวนการตรวจสอบมิจฉาชีพแยกต่างหาก</p>
  `
}

type Relation = 'select' | 'below' | 'current' | 'above'

function relationOf(step: InspectionStep, plan: InspectionPlanJSON): Relation {
  // ยังไม่เคยสมัคร หรือ LAPSED แล้ว (คืนแถวเดิม อัปเดตแทน insert — service ยอมให้ subscribe ซ้ำได้)
  // → ทุกขั้นเข้าทาง subscribe เหมือนกัน ไม่มีขั้น "ปัจจุบัน" ให้เทียบ
  if (plan === null || plan.status === 'LAPSED') return 'select'
  if (step < plan.step) return 'below'
  if (step === plan.step) return 'current'
  return 'above'
}

type Props = {
  plan: InspectionPlanJSON
  canManage: boolean
  intake: IntakeJSON
}

export default function StepLadder({ plan, canManage, intake }: Props) {
  const router = useRouter()
  const [pendingStep, setPendingStep] = useState<InspectionStep | null>(null)
  const [errorByStep, setErrorByStep] = useState<Record<number, string>>({})

  const available = (step: InspectionStep) => intake.stepAvailable.includes(step)

  const runAction = async (step: InspectionStep, relation: 'select' | 'above') => {
    setErrorByStep((prev) => ({ ...prev, [step]: '' }))

    const amount =
      relation === 'select'
        ? subscribeChargeBaht(step)
        : upgradeChargeBaht((plan as NonNullable<InspectionPlanJSON>).step, step)

    const agreed = await pacesConfirmTerms({
      title: relation === 'select' ? `สมัครแผนการตรวจสอบ — ${INSPECTION_STEP_LABEL_TH[step]}` : `อัปเกรดเป็น ${INSPECTION_STEP_LABEL_TH[step]}`,
      termsHtml: termsHtml(amount),
      checkboxLabel: 'ฉันรับทราบเงื่อนไขข้างต้นแล้ว',
      confirmButtonText: 'ยืนยันและจ่ายเงิน',
    })
    if (!agreed) return

    setPendingStep(step)
    try {
      const url =
        relation === 'select' ? '/api/seller/inspection/subscribe' : '/api/seller/inspection/upgrade'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step, termsAccepted: true }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        const message = body?.message ?? 'ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง'
        setErrorByStep((prev) => ({ ...prev, [step]: message }))
        pacesToast.error(message)
        return
      }
      pacesToast.success(
        relation === 'select' ? 'สมัครแผนการตรวจสอบสำเร็จ' : `อัปเกรดเป็น ${INSPECTION_STEP_LABEL_TH[step]} สำเร็จ`,
      )
      router.refresh()
    } catch {
      const message = 'เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง'
      setErrorByStep((prev) => ({ ...prev, [step]: message }))
      pacesToast.error(message)
    } finally {
      setPendingStep(null)
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">ขั้นการตรวจสอบ</h4>
      </div>
      <div className="card-body">
        <div className="grid grid-cols-1 gap-base sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => {
            const relation = relationOf(step, plan)
            const isCurrent = relation === 'current'
            const monthly = INSPECTION_MONTHLY_PRICE_BAHT[step]
            const setup = INSPECTION_SETUP_FEE_BAHT[step]
            const quotaOpen = available(step)
            const error = errorByStep[step]
            const busy = pendingStep === step

            return (
              <div
                key={step}
                className={cn('card h-full rounded-md', isCurrent && '!bg-primary')}
              >
                <div className="card-body p-5 text-center">
                  <h3 className={cn('mb-1 text-lg font-bold', isCurrent && 'text-white')}>
                    {INSPECTION_STEP_LABEL_TH[step]}
                  </h3>

                  <div className="my-4">
                    {PRICING_BLOCKED ? (
                      <p className={cn('text-sm', isCurrent ? 'text-white/70' : 'text-default-400')}>
                        ราคาจะประกาศเร็ว ๆ นี้
                      </p>
                    ) : (
                      <>
                        <p className={cn('text-2xl font-bold', isCurrent && 'text-white')}>
                          {formatBaht(monthly)}
                        </p>
                        <p className={cn('text-xs', isCurrent ? 'text-white/60' : 'text-default-400')}>
                          ต่อเดือน{setup > 0 ? ` + ค่าแรกเข้า ${formatBaht(setup)}` : ''}
                        </p>
                      </>
                    )}
                  </div>

                  {relation === 'below' && (
                    <span className="badge bg-default-100 text-default-500 inline-flex items-center gap-1">
                      <Icon icon="check" className="size-3.5" />
                      รวมอยู่ในขั้นปัจจุบันแล้ว
                    </span>
                  )}

                  {relation === 'current' && (
                    <span className="badge bg-white/20 text-white inline-flex items-center gap-1">
                      <Icon icon="circle-check" className="size-3.5" />
                      ขั้นปัจจุบัน
                    </span>
                  )}

                  {(relation === 'select' || relation === 'above') && (
                    <>
                      {quotaOpen && !PRICING_BLOCKED ? (
                        <button
                          type="button"
                          disabled={!canManage || busy}
                          title={canManage ? undefined : 'เฉพาะเจ้าของร้านเท่านั้นที่จัดการแผนการตรวจสอบได้'}
                          onClick={() => runAction(step, relation)}
                          className="btn bg-primary/15 text-primary hover:bg-primary hover:text-white w-full"
                        >
                          {busy ? (
                            <Icon icon="loader-2" className="size-4 animate-spin" />
                          ) : (
                            <Icon icon={relation === 'select' ? 'plus' : 'arrow-up'} className="size-4" />
                          )}
                          {relation === 'select' ? 'เลือกขั้นนี้' : 'อัปเกรดขั้นนี้'}
                        </button>
                      ) : (
                        <p className="text-default-400 text-xs">
                          {PRICING_BLOCKED
                            ? 'ยังไม่เปิดให้สมัคร'
                            : `ยังไม่เปิดรับสมัครขั้นนี้ในเดือนนี้${
                                intake.nextOpenAt ? ` — เปิดรับรอบถัดไป ${formatDateTH(intake.nextOpenAt)}` : ''
                              }`}
                        </p>
                      )}
                      {error && <p className="text-danger mt-2 text-xs">{error}</p>}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
