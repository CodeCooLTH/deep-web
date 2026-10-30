'use client'

/**
 * การ์ด "งานนี้" ของร้านบริการ — สถานะชุดเดียว + ปิดงาน + เปิดงานอีกครั้ง (feature 00073)
 *
 * แสดงกับ **ทุกงานของร้านบริการ** (มีนัดหรือ walk-in) — เดิมปุ่มผลนัดอยู่ในการ์ดนัดหมาย
 * ซึ่งไม่ render กับงาน walk-in ⇒ งานไม่มีนัดไม่มีทางปิดได้จากหน้านี้เลย
 *
 * สิทธิ์ (00071): เริ่มงาน O4 · ส่วนรับเงินในชีต O5 · คืนมัดจำ/เปิดงานอีกครั้ง O6
 * 00086: ปิดงาน = memberCanCloseJob (ร้านบริการ: เจ้าของ/ผู้จัดการ/คนที่ติ๊ก "ปิดงานได้" · ร้านอื่น = O4 เดิม)
 * ซ่อนปุ่มที่ไม่มีสิทธิ์ — ตัวบังคับจริงอยู่ที่ /api/orders/[token]/close
 *
 * 00086 P3 (S-6/8/9 · ต้นแบบ v13 `cardJob`): แถวผู้รับผิดชอบ + มอบงาน (O2s) · รับงานนี้ (ช่าง) ·
 *   เริ่มงาน/ทำเสร็จแล้ว ผ่านชีตรูป (แทน confirm "เริ่มงานนี้?" เดิม — ชีตคือ flow ที่ตั้งใจเดินเข้ามาเอง) ·
 *   ข้อความ FR-011 เมื่อทำเสร็จแต่ปิดไม่ได้ · ปุ่มไหนขึ้นตัดสินที่ serviceJobCardButtons ที่เดียว
 *
 * Base (โครงการ์ด/ปุ่ม/ข้อความใต้ปุ่ม): ./AppointmentCard.tsx ← theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx
 *   infobox โทนกลาง ← theme/paces/Admin/TS/src/app/(admin)/ui/alerts/page.tsx
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import Icon from '@/components/wrappers/Icon'
import ServiceCloseSheet from '@/components/safepay/service-close/ServiceCloseSheet'
import AssigneeSheet from '@/components/safepay/service-job/AssigneeSheet'
import ServiceJobPhotoSheet, { type ServiceJobPhotoPhase } from '@/components/safepay/service-job/ServiceJobPhotoSheet'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import { formatDateTH, formatDateTimeTH } from '@/lib/format-date'
import type { OrderMoney } from '@/lib/order-payment'
import {
  SERVICE_JOB_ERROR_MESSAGE,
  serviceJobCardButtons,
  serviceJobErrorMessage,
  type ServiceJobPhotoMode,
} from '@/lib/service-job'
import { canCloseServiceJob, canReopenServiceJob, type ServiceStatusKey } from '@/lib/service-status'
import { cn } from '@/utils/helpers'

type Props = {
  publicToken: string
  orderLabel: string
  status: string
  /** ISO — null = ยังไม่ปิด */
  closedAtISO: string | null
  /** ISO — null = ยังไม่กดเริ่มงาน (00078) */
  startedAtISO?: string | null
  /** ป้ายสถานะที่ server derive แล้ว (service-status.ts) */
  badge: { key: ServiceStatusKey; label: string; cls: string; icon: string }
  hasAppointment: boolean
  /** เวลาเริ่มนัด — ปิดงานได้ตั้งแต่เวลานี้ (BR-RSV-34) · null = walk-in */
  startISO: string | null
  /** เวลาจบนัด — คู่กับ startISO ส่งเข้าชีตมอบงาน (ป้ายว่าง/ติดงาน · มติ 2026-10-30) · null = ไม่มีเวลา */
  endISO: string | null
  allDay: boolean
  /**
   * เงินของงาน — ส่งมาเฉพาะผู้มีสิทธิ์รับเงิน (O5) · ไม่ส่ง = ไม่มีส่วนรับเงินในชีต
   * 🛑 จอของช่าง (ระดับเงิน NONE) ต้อง **ไม่มีคีย์นี้เลย** ไม่ใช่ส่ง null — คีย์เงินใด ๆ ใน payload ของช่างผิดกติกา 00071
   */
  money?: OrderMoney
  /** ปุ่มเริ่มงาน (O4) — 00086: แยกจาก canClose (เริ่มได้แต่ปิดไม่ได้ = พนักงานที่ไม่ได้ติ๊ก "ปิดงานได้") */
  canStart: boolean
  /** ปุ่มปิดงาน — memberCanCloseJob ของผู้ดู (ไม่ใช่ canCloseServiceJob ซึ่งคือ "สถานะงานปิดได้") */
  canClose: boolean
  canManage: boolean
  editHref: string | null
  // ─── 00086 P3 — บังคับส่งทุกตัว (ไม่มีค่าตั้งต้นที่เปิดปุ่ม · permission-gate-follows-the-row) ───
  /** ISO — null = ยังไม่กด "ทำเสร็จแล้ว" */
  finishedAtISO: string | null
  /** ผู้รับผิดชอบตอนนี้ (Order.assignedUser) — null = ยังไม่มีคนรับ */
  assignee: { userId: string; name: string } | null
  /** userId ของผู้ดู — ตัดสิน "งานของฉัน" */
  viewerUserId: string
  /** isTechnicianOnly(roles) — ช่างล้วนแตะได้เฉพาะงานของตัวเอง (BRD §8.2) */
  technicianOnly: boolean
  /** canAssignServiceJob(roles) — ปุ่ม "มอบงาน"/"เปลี่ยน" */
  canAssign: boolean
  /** canClaimServiceJob(roles) — ปุ่ม "รับงานนี้" */
  canClaim: boolean
  /** Shop.serviceJobPhotoMode · Shop.serviceJobPhotosBuyerVisible */
  photoMode: ServiceJobPhotoMode
  photosBuyerVisible: boolean
  /** ชื่อคนกดเริ่ม/ทำเสร็จ (actor ของ event ล่าสุด) — null = งานก่อน 00086/ไม่รู้ ⇒ ตัดส่วน "โดย …" */
  startedByName: string | null
  finishedByName: string | null
  /** "บริการ · ลูกค้า" ใต้หัวชีตรูป */
  jobSummary: string | null
}

export default function ServiceJobCard({
  publicToken,
  orderLabel,
  status,
  closedAtISO,
  startedAtISO = null,
  badge,
  hasAppointment,
  startISO,
  endISO,
  allDay,
  money,
  canStart,
  canClose,
  canManage,
  editHref,
  finishedAtISO,
  assignee,
  viewerUserId,
  technicianOnly,
  canAssign,
  canClaim,
  photoMode,
  photosBuyerVisible,
  startedByName,
  finishedByName,
  jobSummary,
}: Props) {
  const router = useRouter()
  const t = useT().autoNotify
  const [sheetOpen, setSheetOpen] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [photoPhase, setPhotoPhase] = useState<ServiceJobPhotoPhase | null>(null)

  const closable = canCloseServiceJob({ status, serviceClosedAt: closedAtISO })
  const reopenable = canReopenServiceJob({ status, serviceClosedAt: closedAtISO })

  /** ยังไม่ถึงเวลานัด = ปิดไม่ได้ — ปลดล็อกเองเมื่อถึงเวลา (เหตุผลเต็มที่ AppointmentCard) */
  const [notStarted, setNotStarted] = useState(() => (startISO ? new Date(startISO).getTime() > Date.now() : false))
  useEffect(() => {
    if (!startISO) return setNotStarted(false)
    const msLeft = new Date(startISO).getTime() - Date.now()
    if (msLeft <= 0) return setNotStarted(false)
    setNotStarted(true)
    if (msLeft > 24 * 60 * 60 * 1000) return
    const t = setTimeout(() => setNotStarted(false), msLeft)
    return () => clearTimeout(t)
  }, [startISO])

  const started = Boolean(startedAtISO)
  const finished = Boolean(finishedAtISO)
  // 00086 P3 — ส่งครบทุก input (ไม่พึ่งค่าตั้งต้นของ helper) · canFinish = O4 ตัวเดียวกับเริ่มงาน
  const show = serviceJobCardButtons({
    canStart,
    canClose,
    closable,
    started,
    notStarted,
    canFinish: canStart,
    canClaim,
    technicianOnly,
    finished,
    assigned: assignee !== null,
    isAssignee: assignee !== null && assignee.userId === viewerUserId,
  })
  const photosOn = photoMode !== 'NONE'

  /** รับงานนี้ — แตะเดียว ไม่มี confirm (ถอนได้: เจ้าของมอบใหม่ได้) */
  async function claim() {
    if (claiming) return
    setClaiming(true)
    try {
      const res = await fetch(`/api/orders/${publicToken}/assign/claim`, { method: 'POST' })
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string; assigneeName?: string | null }
      if (!res.ok) {
        pacesToast.error(json.message ?? SERVICE_JOB_ERROR_MESSAGE[json.error ?? ''] ?? 'รับงานไม่สำเร็จ — รีเฟรชหน้าแล้วลองอีกครั้ง')
        // มีคนรับไปก่อน = ข้อมูลบนจอค้าง → ดึงใหม่ให้เห็นชื่อคนที่รับ
        if (res.status === 409) router.refresh()
        return
      }
      pacesToast.success('รับงานแล้ว · อยู่ใน "งานของฉัน"')
      router.refresh()
    } catch {
      pacesToast.error('รับงานไม่สำเร็จ ตรวจสอบสัญญาณแล้วลองใหม่')
    } finally {
      setClaiming(false)
    }
  }

  async function reopen() {
    const ok = await pacesConfirm({
      icon: 'warning',
      title: 'เปิดงานนี้อีกครั้ง?',
      text: `${orderLabel} · ยอดของงานนี้จะออกจากวันที่ปิดงาน จนกว่าจะปิดใหม่ · มัดจำที่เคยคืนไปแล้วจะไม่กลับมาเอง`,
      confirmButtonText: 'เปิดงานอีกครั้ง',
      cancelButtonText: 'ไม่ใช่ตอนนี้',
    })
    if (!ok) return
    setReopening(true)
    try {
      const res = await fetch(`/api/orders/${publicToken}/close`, { method: 'DELETE' })
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) {
        pacesToast.error(json.message ?? SERVICE_JOB_ERROR_MESSAGE[json.error ?? ''] ?? 'เปิดงานไม่สำเร็จ — รีเฟรชหน้าแล้วลองอีกครั้ง')
        return
      }
      pacesToast.success('เปิดงานอีกครั้งแล้ว')
      router.refresh()
    } catch {
      pacesToast.error('เปิดงานไม่สำเร็จ ตรวจสอบสัญญาณแล้วลองใหม่')
    } finally {
      setReopening(false)
    }
  }

  return (
    <div className="card">
      <div className="card-header flex flex-wrap items-center justify-between gap-2">
        <h4 className="card-title">งานนี้</h4>
        <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium', badge.cls)}>
          <Icon icon={badge.icon} className="shrink-0 text-sm" aria-hidden="true" />
          {badge.label}
        </span>
      </div>
      <div className="card-body">
        {/* 00086 S-6 — ผู้รับผิดชอบ (ทุกสถานะ) · มอบ/เปลี่ยนได้เฉพาะ O2s ∧ ยังไม่ปิด */}
        <div className="bg-default-100 mb-4 flex items-center justify-between gap-3 rounded-lg px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <Icon icon="user-cog" className="text-default-600 shrink-0 text-lg" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-default-700 mb-0 text-xs">ผู้รับผิดชอบ</p>
              {assignee ? (
                <p className="text-dark mb-0 truncate text-sm font-semibold">{assignee.name}</p>
              ) : (
                <p className="text-warning-ink mb-0 text-sm font-semibold">ยังไม่มีคนรับ</p>
              )}
            </div>
          </div>
          {canAssign && !closedAtISO && (
            <button
              type="button"
              onClick={() => setAssignOpen(true)}
              aria-label={assignee ? 'เปลี่ยนผู้รับผิดชอบ' : 'มอบงานนี้'}
              className="btn btn-sm bg-card border-default-300 text-default-800 hover:bg-default-50 min-h-11 shrink-0 border lg:min-h-0"
            >
              {assignee ? 'เปลี่ยน' : 'มอบงาน'}
            </button>
          )}
        </div>

        {closedAtISO && (
          <p className="text-default-700 mb-0 text-sm">
            ปิดงานเมื่อ {formatDateTimeTH(closedAtISO)}
            {status !== 'CONFIRMED' && badge.key !== 'NO_SHOW' && (
              <span className="text-default-600 block text-xs">รอลูกค้ายืนยันรับบริการ — ยืนยันแล้วจึงรีวิวได้</span>
            )}
          </p>
        )}
        {!closedAtISO && status === 'CONFIRMED' && (
          <p className="text-default-700 mb-0 text-sm">ลูกค้ายืนยันรับบริการแล้ว — ปิดงานเพื่อให้ยอดเข้าการเงินร้าน</p>
        )}
        {/* คำแนะนำปิดงาน — เฉพาะคนที่มีปุ่มปิดงานจริง (00086: ตัด "แจ้งเจ้าของร้าน…" ทิ้ง · FR-011 อยู่ในกล่องหลังทำเสร็จแทน) */}
        {!closedAtISO && status !== 'CONFIRMED' && show.close && (
          <p className="text-default-700 mb-0 text-sm">
            {/* 00086: ปิดงานได้แต่รับเงินไม่ได้ (ไม่มี money = ไม่มี O5 เช่นช่างที่ติ๊กปิดงานได้) ห้ามบอกว่า "รับเงิน" */}
            {money
              ? <>ทำงานเสร็จแล้วกด &ldquo;ปิดงาน&rdquo; — บันทึกผลและรับเงินที่เหลือในครั้งเดียว</>
              : <>ทำงานเสร็จแล้วกด &ldquo;ปิดงาน&rdquo; เพื่อบันทึกผล — การรับเงินให้เจ้าของร้านหรือฝ่ายเปิดบิลบันทึก</>}
          </p>
        )}

        {/* เริ่มงาน (00078) — ไม่เปลี่ยนสถานะ/เงิน; กดแล้วแทนปุ่มด้วยข้อความเวลา · ซ่อนเมื่อยังไม่ถึงนัด */}
        {show.startedNote && startedAtISO && (
          <p className="text-default-700 mb-0 mt-4 text-sm">
            {fmt(t.startedAt, { time: formatDateTimeTH(startedAtISO) })}
            {startedByName ? ` · โดย ${startedByName}` : ''}
          </p>
        )}
        {/* 00086 — ทำเสร็จแล้ว รอคนที่มีสิทธิ์ปิดงาน */}
        {finishedAtISO && !closedAtISO && (
          <p className="text-default-700 mb-0 mt-2 text-sm">
            {/* critique P1-1/P1-2 — เว้นวรรคหลังชื่อ · ไม่ต่อ "· รอปิดงาน" (ป้ายหัวการ์ด + กล่อง FR-011 บอกแล้ว) */}
            {finishedByName ? `${finishedByName} ` : ''}ทำเสร็จเมื่อ {formatDateTimeTH(finishedAtISO)} น.
          </p>
        )}

        {/* 00086 — ช่างล้วนดูงานของคนอื่น: บอกว่าเป็นของใคร (คำเดียวกับที่ server ตอบ 403) */}
        {show.notAssigneeNote && assignee && (
          <div className="border-default-200 mt-4 border-t border-dashed pt-4">
            <p className="text-default-700 bg-default-100 mb-0 flex items-start gap-1.5 rounded-lg px-3 py-2 text-xs">
              <Icon icon="lock" className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
              <span className="min-w-0">
                {serviceJobErrorMessage('SERVICE_JOB_NOT_ASSIGNEE', {
                  assigneeName: assignee.name,
                  action: !started ? 'START' : !finished ? 'FINISH' : 'CLOSE',
                })}
              </span>
            </p>
          </div>
        )}

        {/* 00086 — รับงานนี้ (ช่างล้วน ∧ ยังไม่มีคนรับ) แทนปุ่มเริ่มงาน */}
        {show.claim && (
          <div className="border-default-200 mt-4 border-t border-dashed pt-4">
            <button
              type="button"
              disabled={claiming}
              onClick={() => void claim()}
              className="btn bg-primary/10 text-primary-ink hover:bg-primary/20 min-h-11 w-full gap-2 disabled:opacity-60"
            >
              <Icon icon={claiming ? 'loader-2' : 'user-check'} className={cn('text-base', claiming && 'animate-spin')} aria-hidden="true" />
              รับงานนี้
            </button>
            <p className="text-default-700 mb-0 mt-2 text-center text-xs">งานจะย้ายไปอยู่ใน &ldquo;งานของฉัน&rdquo;</p>
          </div>
        )}

        {show.start && (
          <div className="border-default-200 mt-4 border-t border-dashed pt-4">
            <button
              type="button"
              onClick={() => setPhotoPhase('START')}
              className="btn bg-primary/10 text-primary-ink hover:bg-primary/20 min-h-11 w-full gap-2"
            >
              <Icon icon={photosOn ? 'camera' : 'player-play'} className="text-base" aria-hidden="true" />
              {photosOn ? `${t.startJob} · ถ่ายรูปก่อนทำ` : t.startJob}
            </button>
          </div>
        )}

        {/* 00086 — ทำเสร็จแล้ว (ปุ่มโทนเดียวกับเริ่มงาน: ช่างกดเองยังไม่ใช่การยืนยัน · UX D2) */}
        {show.finish && (
          <div className="border-default-200 mt-4 border-t border-dashed pt-4">
            <button
              type="button"
              onClick={() => setPhotoPhase('FINISH')}
              className="btn bg-primary/10 text-primary-ink hover:bg-primary/20 min-h-11 w-full gap-2"
            >
              <Icon icon={photosOn ? 'camera' : 'check'} className="text-base" aria-hidden="true" />
              {photosOn ? 'ทำเสร็จแล้ว · ถ่ายรูปหลังทำ' : 'ทำเสร็จแล้ว'}
            </button>
          </div>
        )}

        {/* 00086 FR-011 — ทำเสร็จแล้วแต่ผู้ดูปิดไม่ได้
            TECH_END (ช่างเจ้าของงาน): บอกว่าส่วนของเขาครบแล้ว + ขั้นถัดไปเป็นของใคร — ไม่ใช้คำห้าม (มติ user 2026-10-30) */}
        {show.closeBlockedNote !== 'NONE' && (
          <div className="border-default-200 mt-4 border-t border-dashed pt-4">
            <p className="text-default-700 bg-default-100 mb-0 flex items-start gap-1.5 rounded-lg px-3 py-2 text-xs">
              <Icon
                icon={show.closeBlockedNote === 'TECH_END' ? 'circle-check' : 'lock'}
                className="mt-0.5 shrink-0 text-sm"
                aria-hidden="true"
              />
              <span className="min-w-0">
                {show.closeBlockedNote === 'TECH_END'
                  ? 'ส่งงานแล้ว · รอเจ้าของร้านหรือผู้มีสิทธิ์ปิดงาน'
                  : 'ทำเสร็จแล้ว · รอเจ้าของร้านหรือคนที่มีสิทธิ์ปิดงาน'}
              </span>
            </p>
          </div>
        )}

        {show.close && (
          <div className="border-default-200 mt-4 border-t border-dashed pt-4">
            <button
              type="button"
              disabled={notStarted}
              onClick={() => setSheetOpen(true)}
              className="btn bg-primary hover:bg-primary-hover min-h-11 w-full gap-2 text-white disabled:opacity-60"
            >
              <Icon icon="clipboard-check" className="text-base" aria-hidden="true" />
              ปิดงาน
            </button>
            {notStarted && startISO && (
              <p className="text-default-700 mb-0 mt-2 text-xs">
                ปิดงานได้ตั้งแต่ {allDay ? formatDateTH(startISO) : formatDateTimeTH(startISO)}
              </p>
            )}
          </div>
        )}

        {/* เปิดงานอีกครั้ง (มติ D2) — ปิดผิดแก้ได้ก่อนลูกค้ายืนยัน · ปุ่มโทนเบา: ไม่ใช่ action หลัก */}
        {canManage && reopenable && (
          <div className="border-default-200 mt-4 border-t border-dashed pt-4">
            <button
              type="button"
              disabled={reopening}
              onClick={() => void reopen()}
              className="btn bg-default-100 text-default-800 hover:bg-default-200 min-h-11 w-full gap-2 disabled:opacity-60"
            >
              <Icon icon={reopening ? 'loader-2' : 'clipboard-x'} className={cn('text-base', reopening && 'animate-spin')} aria-hidden="true" />
              เปิดงานอีกครั้ง
            </button>
          </div>
        )}
      </div>

      <ServiceCloseSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        orderToken={publicToken}
        orderLabel={orderLabel}
        hasAppointment={hasAppointment}
        money={money ?? null}
        canRefundDeposit={canManage}
        editHref={editHref}
        // 00086 — เริ่มงานแล้ว = ลูกค้ามาแล้ว ⇒ ไม่มีตัวเลือก "ไม่มาตามนัด" (server กัน 409 ด้วย)
        serviceStarted={started}
        onClosed={() => router.refresh()}
      />
      {canAssign && (
        <AssigneeSheet
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
          orderToken={publicToken}
          orderLabel={orderLabel}
          currentUserId={assignee?.userId ?? null}
          window={startISO && endISO ? { from: new Date(startISO), to: new Date(endISO) } : null}
          onDone={() => router.refresh()}
        />
      )}
      <ServiceJobPhotoSheet
        open={photoPhase !== null}
        onClose={() => setPhotoPhase(null)}
        phase={photoPhase ?? 'START'}
        orderToken={publicToken}
        orderLabel={orderLabel}
        summaryLine={jobSummary}
        photoMode={photoMode}
        buyerVisible={photosBuyerVisible}
        onDone={() => router.refresh()}
      />
    </div>
  )
}
