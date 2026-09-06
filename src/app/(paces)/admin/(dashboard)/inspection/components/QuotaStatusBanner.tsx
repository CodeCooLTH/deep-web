/**
 * QuotaStatusBanner — สถานะการเปิดรับสมัครแผนตรวจสอบของ "เดือนนี้" (feature 00060)
 *
 * Base: src/app/(paces)/seller/(dashboard)/business/components/AdvanceWarningBanner.tsx
 *   (โครง role="alert" + แถบ bg-{semantic}/15 + ลิงก์ต่อท้าย) — ปรับสีตัวอักษรเป็น `-ink`
 *   เพราะ `text-warning` บนพื้น `/15` คอนทราสต์ไม่ผ่าน AA
 *
 * 🛑 เหตุผลที่คอมโพเนนต์นี้มีอยู่: cron คำนวณ `sourceMissing` ได้ถูกต้องมาตั้งแต่วันแรก แต่ส่งออก
 *    ทาง JSON response ของ cron ที่ไม่มีใครเปิดอ่าน (แพลน Vercel นี้ query runtime log ย้อนหลัง
 *    ไม่ได้) ⇒ ถ้าไม่มีใครตั้งโควตา ร้านทุกร้านจะเห็น "ยังไม่เปิดรับสมัคร" ตลอดกาล
 *    โดยที่ **ทุกจอของแอดมินดูปกติ** — ระบบไม่พังสักบรรทัด มันแค่ไม่รับใครเลย
 *
 * 🛑 ไม่ใช้สีอันตราย (danger) กับสถานะ "ยังไม่ตั้งโควตา" — มันคือความผิดของทีมเราเอง ไม่ใช่
 *    ของร้าน · ความเด่นมาจาก **น้ำหนักภาพ** (กล่องเต็มความกว้างบนสุด) ไม่ใช่จากความแรงของสี
 */
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { INSPECTION_STEP_LABEL_TH } from '@/lib/inspection/checks'
import type { QuotaRow } from '@/services/inspection-admin.service'

type Props = { quotas: QuotaRow[] }

/** ชื่อขั้นที่คนอ่านออก — "ขั้น 2 ตรวจเอกสาร" (SSOT ของคำอยู่ที่ checks.ts) */
const stepName = (step: QuotaRow['step']) => `ขั้น ${step} ${INSPECTION_STEP_LABEL_TH[step]}`

/** "ก" · "ก และ ข" · "ก, ข และ ค" — คั่นตัวสุดท้ายด้วย "และ" ตามการเขียนไทยปกติ */
function joinTh(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} และ ${items[items.length - 1]}`
}

export default function QuotaStatusBanner({ quotas }: Props) {
  const notSeeded = quotas.filter((q) => !q.seeded)
  const full = quotas.filter((q) => q.seeded && q.remaining === 0)
  const open = quotas.filter((q) => q.seeded && q.remaining > 0)

  if (notSeeded.length > 0) {
    const allMissing = notSeeded.length === quotas.length
    return (
      <div
        role="alert"
        aria-live="polite"
        className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/20 bg-warning/15 px-4 py-3"
      >
        <div className="flex items-start gap-2">
          <Icon icon="alert-triangle" className="text-warning-ink mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p className="text-warning-ink text-sm">
            {allMissing
              ? 'ทุกขั้นยังไม่ได้ตั้งโควตาเดือนนี้เลย'
              : `ยังไม่ได้ตั้งโควตาเดือนนี้ — ${joinTh(notSeeded.map((q) => stepName(q.step)))}`}
            {' '}ร้านที่มาสมัครใหม่จะเห็นว่า &ldquo;ยังไม่เปิดรับสมัคร&rdquo; ทั้งที่ไม่มีใครตั้งใจปิด
          </p>
        </div>
        <Link
          href="/inspection/quota"
          className="btn btn-sm border border-warning/40 text-warning-ink shrink-0"
        >
          ไปตั้งโควตา
          <Icon icon="chevron-right" className="size-4" aria-hidden="true" />
        </Link>
      </div>
    )
  }

  return (
    <div className="card mb-4">
      <div className="card-body flex flex-wrap items-center justify-between gap-3 !py-3">
        <div className="flex items-center gap-2">
          <Icon icon="calendar-stats" className="text-default-500 size-4 shrink-0" aria-hidden="true" />
          <p className="text-default-700 text-sm">
            โควตารับสมัครเดือนนี้:{' '}
            {open.length > 0 && <span className="badge bg-success/15 text-success-ink">เปิดรับอยู่ {open.length} ขั้น</span>}
            {open.length === 0 && <span className="badge bg-warning/15 text-warning-ink">เต็มแล้วทั้ง {full.length} ขั้น</span>}
            {/* พูดถึง "เต็มแล้ว" เฉพาะตอนมีจริง — อย่าเล่าถึงสิ่งที่ไม่มี */}
            {open.length > 0 && full.length > 0 && (
              <>
                {' '}
                <span className="badge bg-warning/15 text-warning-ink">
                  เต็มแล้ว {joinTh(full.map((q) => INSPECTION_STEP_LABEL_TH[q.step]))}
                </span>
              </>
            )}
          </p>
        </div>
        <Link href="/inspection/quota" className="text-primary inline-flex shrink-0 items-center gap-0.5 text-sm font-medium">
          โควตารายเดือน
          <Icon icon="chevron-right" className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  )
}
