'use client'

/**
 * ShipmentStatusView — พัสดุที่เปิดไปแล้ว 1 ใบ (feature 00022)
 *
 * ใช้ร่วมกัน 2 ที่: ส่วนการจัดส่งในหน้าคำสั่งซื้อ และโมดัลในหน้าแชท
 * ปุ่มที่เป็นเรื่องเฉพาะบริบท (เช่น "แจ้งเลขในแชท") ผู้เรียกใส่เองผ่าน actions
 *
 * Base: orders/[token]/components/ShipmentPanel.tsx (สถานะ 3/4 เดิม — kv rows, timeline traces,
 *       ปุ่มพิมพ์ใบปะหน้า/ยกเลิก) + badge จาก theme/paces/Admin/TS/src/app/(admin)/ui/badges
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import { formatDateTime, formatRelativeDayTime } from '@/lib/format-date'
import { courierInitials, courierLogoUrl } from '@/lib/iship/courier'
import { TONE_BADGE, NOTICE_BOX } from './tone'
import {
  SHIPMENT_STAGES,
  describeCarrierStatus,
  describeProgress,
  describeShipmentStatus,
} from '@/lib/iship/status'
import type { ReceiverData, ShipmentReviewItem, ShipmentViewJson } from '@/lib/iship/context'

interface TraceEvent {
  status: string
  statusText: string | null
  statusDesc: string | null
  location: string | null
  occurredAt: string
}

interface Props {
  shipment: ShipmentViewJson
  /**
   * ปุ่มหลักของผู้เรียก (เช่น "แจ้งเลขในแชท") — อยู่ในแถบล่างที่ปักติดขอบ
   * ต้องเป็นปุ่มที่กว้างเต็ม container ที่ให้ (ผู้เรียกใส่ w-full เอง)
   */
  actions?: React.ReactNode
  /**
   * ผู้รับของพัสดุใบนี้ (user request 2026-08-07 "ข้อมูลน้อย")
   *
   * มากับ ShipmentContextJson ที่ผู้เรียกโหลดอยู่แล้วทั้งสองที่ — ไม่ต้องยิง API เพิ่ม
   * ไม่ส่ง = ไม่แสดงบล็อกผู้รับ (ไม่ใช่ "ไม่มีผู้รับ")
   */
  receiver?: ReceiverData | null
  /** สินค้าในคำสั่งซื้อ — มากับ context ชุดเดียวกับ receiver */
  items?: ShipmentReviewItem[]
  onCancelled: () => void
  onRetried: (shipment: ShipmentViewJson) => void
  /** "แก้ข้อมูลแล้วลองใหม่" — ผู้เรียกสลับกลับไปแสดงฟอร์ม */
  onEditRequest?: () => void
}

/**
 * หน้าเข้าสู่ระบบของ iShip — ตั้งใจชี้หน้าแรก ไม่ใช่ `/wallet/topup` (user ยืนยัน 2026-08-06)
 *
 * ลิงก์ลึกเข้าไปที่หน้าเติมเงินตรง ๆ เข้าไม่ถึง: ร้านต้องล็อกอินที่หน้าแรกก่อนเสมอ
 * ลิงก์ที่พาไปแล้วเจอหน้าที่เข้าไม่ได้ แย่กว่าลิงก์ที่พาไปหน้าแรกแล้วให้เดินต่อเอง
 *
 * hardcode ที่นี่โดยเจตนา: `ISHIP_BASE_URL` เป็น env ฝั่งเซิร์ฟเวอร์ (ไว้สลับไประบบทดสอบ)
 * ส่วนลิงก์นี้คือ "ที่ที่ร้านไปเติมเงินจริง" ซึ่งเป็นของ production เสมอ ไม่ควรผูกกัน
 */
const ISHIP_TOPUP_URL = 'https://app.iship.cloud/'

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } }
    return body.error?.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่'
  } catch {
    return 'เกิดข้อผิดพลาด กรุณาลองใหม่'
  }
}

/**
 * ต้องเขียน class เต็มตัวทุกอัน — Tailwind สแกนซอร์สแบบข้อความ
 * `bg-${tone}/15` จะไม่ถูกสร้าง แล้ว badge จะออกมาไม่มีสีโดยไม่มี error ให้เห็น
 */
const STAGE_DOT: Record<string, string> = {
  progress: 'bg-primary text-white',
  delivered: 'bg-success text-white',
  diverted: 'bg-default-300 text-white',
  stopped: 'bg-default-100 text-default-400',
}

const STAGE_LINE: Record<string, string> = {
  progress: 'bg-primary',
  delivered: 'bg-success',
  diverted: 'bg-default-300',
  stopped: 'bg-default-200',
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dashed border-default-200 py-2 text-sm last:border-0">
      <span className="text-default-700">{label}</span>
      <span className="text-end font-semibold text-default-900">{value}</span>
    </div>
  )
}

/** จำนวนเหตุการณ์ที่โชว์ก่อนกด "ดูทั้งหมด" — 3 พอเล่าเรื่อง "ตอนนี้อยู่ไหน มาจากไหน" */
const TRACE_PREVIEW = 3

export default function ShipmentStatusView({
  shipment,
  actions,
  receiver,
  items,
  onCancelled,
  onRetried,
  onEditRequest,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [traces, setTraces] = useState<TraceEvent[] | null>(null)
  const [loadingTraces, setLoadingTraces] = useState(false)
  /**
   * เดิมการเดินทางทั้งก้อนถูกพับไว้หลังปุ่ม "ดูรายละเอียดการเดินทาง" — user report 2026-08-07
   * ว่าหน้านี้ "ข้อมูลน้อย" ทั้งที่ของที่ร้านอยากรู้ที่สุด (ตอนนี้พัสดุอยู่ไหน) ถูกซ่อนอยู่พอดี
   * ตอนนี้โชว์ 3 เหตุการณ์ล่าสุดเสมอ ปุ่มที่เหลือคือ "ดูทั้งหมด" ไม่ใช่ "เปิด/ปิด"
   */
  const [showAllTraces, setShowAllTraces] = useState(false)
  /** ค่าคงที่ของใบนี้ (น้ำหนัก/ขนาด/สร้างเมื่อ/พิมพ์ใบปะหน้า) — อ่านครั้งเดียวก็พอ พับไว้ */
  const [showSpec, setShowSpec] = useState(false)
  // เมนู ⋯ ในแถบล่าง — ที่อยู่ใหม่ของการกระทำที่ถอนคืนไม่ได้ (ดูคอมเมนต์ที่แถบล่าง)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const progress = describeProgress(shipment.status, shipment.carrierStatus)

  async function handleRetry() {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/seller/iship/shipments/${shipment.id}/retry`, {
        method: 'POST',
        cache: 'no-store',
      })
      if (!res.ok) {
        pacesToast.error(await readError(res))
        return
      }
      const body = (await res.json()) as ShipmentViewJson
      if (body.status === 'CREATED') pacesToast.success('สร้างพัสดุสำเร็จ')
      else pacesToast.error(body.lastErrorMessage ?? 'ยังสร้างพัสดุไม่สำเร็จ')
      onRetried(body)
    } catch {
      pacesToast.error('ลองใหม่ไม่สำเร็จ กรุณาลองอีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  /**
   * เลิกผูก ≠ ยกเลิกพัสดุ — ใช้ pacesConfirm.question (ไม่ใช่ .danger) โดยเจตนา
   * เพราะไม่มีอะไรถูกทำลาย พัสดุจริงบน iShip ยังอยู่ครบและยังส่งของตามปกติ
   * ถ้าใช้กล่องแดงเหมือนยกเลิกพัสดุ ร้านจะกลัวจนไม่กล้าแก้ใบที่ผูกผิด
   */
  async function handleUnlink() {
    if (busy) return
    const ok = await pacesConfirm.question(
      'ยกเลิกการผูกพัสดุนี้',
      'พัสดุใบนี้จะไม่ผูกกับคำสั่งซื้อนี้อีก — พัสดุจริงที่ iShip จะไม่ถูกยกเลิก คุณเลือกผูกใบอื่นหรือสร้างใหม่ได้ทันที',
      { confirmButtonText: 'ยกเลิกการผูก', cancelButtonText: 'ไม่ยกเลิก' },
    )
    if (!ok) return

    setBusy(true)
    try {
      const res = await fetch(`/api/seller/iship/shipments/${shipment.id}/unlink`, {
        method: 'POST',
        cache: 'no-store',
      })
      if (!res.ok) {
        pacesToast.error(await readError(res))
        return
      }
      pacesToast.success('ยกเลิกการผูกแล้ว')
      onCancelled()
    } catch {
      pacesToast.error('ยกเลิกการผูกไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setBusy(false)
    }
  }

  async function handleCancel() {
    if (busy) return
    const ok = await pacesConfirm.danger(
      'ยกเลิกพัสดุ',
      'ยกเลิกได้เฉพาะตอนที่ขนส่งยังไม่รับของ — ยกเลิกแล้วเปิดพัสดุใบใหม่สำหรับคำสั่งซื้อนี้ได้',
      { confirmButtonText: 'ยกเลิกพัสดุ', cancelButtonText: 'ไม่ยกเลิก' },
    )
    if (!ok) return

    setBusy(true)
    try {
      const res = await fetch(`/api/seller/iship/shipments/${shipment.id}/cancel`, {
        method: 'POST',
        cache: 'no-store',
      })
      if (!res.ok) {
        pacesToast.error(await readError(res))
        return
      }
      pacesToast.success('ยกเลิกพัสดุแล้ว')
      onCancelled()
    } catch {
      pacesToast.error('ยกเลิกไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setBusy(false)
    }
  }

  async function handleCopy() {
    if (!shipment.trackingNo) return
    try {
      await navigator.clipboard.writeText(shipment.trackingNo)
      pacesToast.success('คัดลอกเลขติดตามแล้ว')
    } catch {
      // clipboard ต้องการ https — บน dev ที่ไม่ใช่ https จะล้มเหลว ให้บอกตามตรง
      pacesToast.warning('คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกและคัดลอกด้วยตัวเอง')
    }
  }

  /**
   * โหลดการเดินทางของพัสดุ — ยิงเองตอนเปิดดู ไม่ต้องให้ร้านกดอีกที (user request 2026-07-29)
   *
   * เงียบเมื่อล้มเหลว (ไม่ขึ้น toast) เพราะเป็นการยิงอัตโนมัติที่ร้านไม่ได้สั่ง —
   * เด้ง error ใส่หน้าทุกครั้งที่เปิดโมดัลจะกวนมากกว่ามีประโยชน์ ปุ่มรีเฟรชที่ร้านกดเอง
   * ค่อยบอก error ตรง ๆ ได้
   */
  const loadTraces = useCallback(
    async (opts?: { silent?: boolean }) => {
      setLoadingTraces(true)
      try {
        const res = await fetch(`/api/seller/iship/shipments/${shipment.id}/traces`, {
          cache: 'no-store',
        })
        if (!res.ok) {
          if (!opts?.silent) pacesToast.error(await readError(res))
          return
        }
        setTraces((await res.json()) as TraceEvent[])
      } catch {
        if (!opts?.silent) pacesToast.error('โหลดการเดินทางของพัสดุไม่สำเร็จ')
      } finally {
        setLoadingTraces(false)
      }
    },
    [shipment.id],
  )

  // ยิงครั้งเดียวตอนเปิด — พัสดุที่ยังไม่มีเลขติดตามยังไม่มีอะไรให้ติดตาม จึงข้าม
  useEffect(() => {
    if (!shipment.trackingNo) return
    void loadTraces({ silent: true })
  }, [shipment.trackingNo, loadTraces])

  // ── สร้างไม่สำเร็จ — ไม่แสดง kv/timeline เพราะยังไม่มีพัสดุจริงให้ติดตาม
  if (shipment.status === 'FAILED') {
    /**
     * เครดิต iShip ไม่พอ = ร้านต้องออกไปทำอะไรที่อื่นก่อน กดลองใหม่ตรงนี้กี่ครั้งก็ได้ผลเดิม
     * (เคสจริง prod 2026-08-06: ร้านกดไป 3 และ 4 ครั้งติดกันเพราะจอบอกแค่ว่า "ลองใหม่")
     * จึงยกขึ้นเป็นกล่องเต็มพร้อมทางออก แทนที่จะเป็นข้อความบรรทัดเดียวเท่ากับ error อื่น
     */
    const needsTopUp = shipment.lastErrorCode === 'INSUFFICIENT_BALANCE'
    return (
      <div className="flex flex-col gap-3 p-4">
        {needsTopUp ? (
          <div className="flex gap-3 rounded-lg bg-danger/15 p-4 text-danger-ink" role="alert">
            <Icon icon="tabler:wallet" className="mt-0.5 size-8 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h4 className="mb-1 text-base font-semibold text-danger-ink">
                เครดิต iShip ไม่พอ — ต้องเติมเงินก่อน
              </h4>
              <p className="mb-2 text-sm">
                {shipment.lastErrorMessage ?? 'ยอดเงินในบัญชี iShip ไม่พอสำหรับเปิดพัสดุ'}
              </p>
              {/* ที่มาของความสับสนที่เจอจริง: หน้าแรกของ iShip โชว์ยอดรวม แต่ยอดที่เปิดพัสดุได้
                  ถูกหักด้วย "เครดิตที่ถูกกันไว้" ของพัสดุที่ยังไม่เคลียร์สถานะอยู่ */}
              <p className="mb-3 text-xs">
                ยอดที่เปิดพัสดุได้จริง = เงินคงเหลือ − เครดิตที่ถูกกันไว้ (iShip กันไว้สำรองค่าส่งของพัสดุที่ยังไม่เคลียร์สถานะ)
              </p>
              <a
                href={ISHIP_TOPUP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm inline-flex items-center gap-1.5 bg-danger text-white"
              >
                <Icon icon="tabler:external-link" className="text-base" aria-hidden="true" />
                เข้าระบบ iShip เพื่อเติมเงิน
              </a>
            </div>
          </div>
        ) : (
          <p className="mb-0 flex items-start gap-2 rounded-lg bg-danger/15 px-3 py-2.5 text-sm text-danger-ink">
            <Icon icon="tabler:alert-circle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
            <span>{shipment.lastErrorMessage ?? 'สร้างพัสดุไม่สำเร็จ'}</span>
          </p>
        )}
        <p className="mb-0 flex items-start gap-2 rounded-lg bg-info/15 px-3 py-2.5 text-sm text-info-ink">
          <Icon icon="tabler:info-circle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
          <span>
            ลองใหม่จะใช้คีย์เดิม ไม่เปิดพัสดุใบที่สอง — ถ้าครั้งก่อนเปิดสำเร็จแล้วแต่คำตอบหาย
            ระบบจะคืนใบเดิมให้
          </span>
        </p>
        {/* เครดิตไม่พอ = ปุ่มนี้ไม่ใช่ทางออก ลดเป็นปุ่มรอง ให้ "ไปเติมเงิน" เป็นการกระทำหลักแทน
            (ยังต้องมีอยู่ เพราะเติมเงินเสร็จแล้วร้านกลับมากดต่อจากตรงนี้ได้เลย) */}
        <button
          type="button"
          onClick={handleRetry}
          disabled={busy}
          className={
            needsTopUp
              ? 'btn inline-flex w-full items-center justify-center gap-2 border border-default-300 p-3 text-default-700 disabled:opacity-60'
              : 'btn inline-flex w-full items-center justify-center gap-2 bg-primary p-3 text-white hover:bg-primary-hover disabled:opacity-60'
          }
        >
          {busy ? (
            // สปินเนอร์ต้องเปลี่ยนสีตามปุ่มด้วย — ขาวบนปุ่มรองพื้นอ่อน = มองไม่เห็นว่ากำลังทำงาน
            <span
              className={`inline-block size-4 animate-spin rounded-full border-2 border-t-transparent ${
                needsTopUp ? 'border-default-400' : 'border-white'
              }`}
            />
          ) : (
            <Icon icon="tabler:refresh" className="text-base" aria-hidden="true" />
          )}
          ลองใหม่
        </button>
        {onEditRequest && (
          <button
            type="button"
            onClick={onEditRequest}
            disabled={busy}
            className="btn inline-flex w-full items-center justify-center gap-2 border border-default-300 py-2.5 text-default-700 disabled:opacity-60"
          >
            <Icon icon="tabler:edit" className="text-base" aria-hidden="true" />
            แก้ข้อมูลแล้วลองใหม่
          </button>
        )}
      </div>
    )
  }


  // สถานะจากขนส่งสำคัญกว่าสถานะฝั่งเรา — ถ้ายังไม่มีค่อยใช้ของเรา (เพิ่งสร้าง ขนส่งยังไม่อัปเดต)
  const badge = shipment.carrierStatus
    ? describeCarrierStatus(shipment.carrierStatus)
    : describeShipmentStatus(shipment.status)
  const badgeText = shipment.carrierStatusText ?? badge.text

  const logo = courierLogoUrl(shipment.courierCode, shipment.courierName)
  const courierLabel = shipment.courierName ?? shipment.courierCode ?? 'ขนส่ง'
  const shownTraces = traces ? (showAllTraces ? traces : traces.slice(0, TRACE_PREVIEW)) : []
  const addressLines = receiver
    ? [
        receiver.line1,
        [receiver.subdistrict, receiver.district].filter(Boolean).join(' '),
        [receiver.province, receiver.postcode].filter(Boolean).join(' '),
      ].filter((l): l is string => Boolean(l && l.trim()))
    : []
  const hasReceiver = Boolean(receiver && (receiver.name || receiver.phone || addressLines.length > 0))
  const itemCount = items?.reduce((n, it) => n + it.qty, 0) ?? 0

  /** คัดลอกที่อยู่ทั้งก้อน — ร้านเอาไปวางในระบบอื่น/ส่งต่อให้คนแพ็คของได้ในทีเดียว */
  async function handleCopyAddress() {
    if (!receiver) return
    const text = [receiver.name, receiver.phone, ...addressLines].filter(Boolean).join('\n')
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      pacesToast.success('คัดลอกที่อยู่ผู้รับแล้ว')
    } catch {
      pacesToast.warning('คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกและคัดลอกด้วยตัวเอง')
    }
  }

  return (
    <div className="flex flex-col">
      {/* ── หัวเรื่อง: ขนส่ง + เลขติดตาม + สถานะ ─────────────────────────────
          เลขติดตามเป็น "ปุ่มคัดลอก" ในตัวมันเอง (user request 2026-08-07 — เดิมต้องเลื่อนลงไป
          หาปุ่มคัดลอกที่ล่างสุด) ตัวเลขคือสิ่งที่ตาไปหยุดอยู่แล้ว ปุ่มจึงควรอยู่ตรงนั้น */}
      <section className="border-b-8 border-default-100 p-4">
        {/* เรื่องวิธีชำระเงินที่เพิ่งเกิดตอนกดสร้าง/ผูก (ส่วนขยาย 2026-08-06) — อยู่เหนือ
            ป้ายโหมดทดสอบเพราะเป็นสิ่งที่ "เพิ่งเปลี่ยนเดี๋ยวนี้" ส่วนป้ายทดสอบเป็นสถานะคงที่
            ค่านี้ไม่ถูกเก็บลงฐาน (ไม่อยู่ใน SHIPMENT_SELECT) — เห็นได้เฉพาะรอบที่สร้าง/ผูก
            เท่านั้น รีเฟรชแล้วหาย รอยถาวรอยู่ในไทม์ไลน์ (PAYMENT_METHOD_SYNCED) แทน */}
        {shipment.paymentNotice && (
          <p
            className={`mb-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
              NOTICE_BOX[shipment.paymentNotice.kind === 'changed' ? 'info' : 'warning']
            }`}
          >
            <Icon icon="tabler:alert-circle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
            <span>{shipment.paymentNotice.message}</span>
          </p>
        )}

        {shipment.isDryRun && (
          <p className="mb-3 flex items-center gap-2 rounded-lg bg-warning/15 px-3 py-2 text-xs text-warning-ink">
            <Icon icon="tabler:flask" className="shrink-0 text-base" aria-hidden="true" />
            พัสดุจำลอง (โหมดทดสอบ) — ไม่ได้ส่งออกไปที่ขนส่งจริง
          </p>
        )}

        <div className="flex items-start gap-3">
          {/* โลโก้ขนส่งจาก COURIER_LOGO ที่เดียว (lib/iship/courier.ts) — ไม่มีไฟล์ = ตัวย่อ
              object-contain + ring: โลโก้พื้นขาวจะกลืนการ์ดขาว (บทเรียนเดียวกับ OrderCard.tsx) */}
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt={courierLabel}
              className="ring-default-200 size-11 shrink-0 rounded-lg object-contain ring-1"
            />
          ) : (
            <span className="bg-default-100 text-default-700 flex size-11 shrink-0 items-center justify-center rounded-lg text-sm font-bold">
              {courierInitials(shipment.courierName, shipment.courierCode)}
            </span>
          )}

          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={handleCopy}
              disabled={!shipment.trackingNo}
              aria-label={shipment.trackingNo ? `คัดลอกเลขติดตาม ${shipment.trackingNo}` : 'ยังไม่มีเลขติดตาม'}
              className="btn -ms-1 inline-flex max-w-full items-center gap-2 p-1 text-start disabled:opacity-60"
            >
              <span className="truncate text-lg font-bold tabular-nums text-default-900">
                {shipment.trackingNo ?? '—'}
              </span>
              {shipment.trackingNo && (
                <span className="bg-primary/15 text-primary-ink flex size-7 shrink-0 items-center justify-center rounded-lg">
                  <Icon icon="tabler:copy" className="text-base" aria-hidden="true" />
                </span>
              )}
            </button>
            <p className="mb-0 mt-1">
              <span className={TONE_BADGE[badge.tone] ?? TONE_BADGE.secondary}>{badgeText}</span>
            </p>
            <p className="text-default-700 mb-0 mt-1.5 text-xs">
              {courierLabel}
              {shipment.carrierStatusAt
                ? ` · อัปเดต ${formatRelativeDayTime(new Date(shipment.carrierStatusAt))}`
                : ''}
            </p>
          </div>
        </div>

        {(shipment.isOverWeight || shipment.isOverSize) && (
          <p className="mb-0 mt-3 flex items-start gap-2 rounded-lg bg-warning/15 px-3 py-2 text-xs text-warning-ink">
            <Icon icon="tabler:scale" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
            ขนส่งวัด{shipment.isOverWeight ? 'น้ำหนัก' : 'ขนาด'}ได้เกินกว่าที่แจ้งไว้ —
            ค่าส่งจริงอาจสูงกว่าที่ประเมิน
          </p>
        )}

        {/* ใบที่ผูกเข้ามา — บอกที่มาไว้ตรงนี้ ส่วน "ยกเลิกการผูก" ย้ายไปอยู่ในเมนู ⋯ รวมกับ
            การกระทำที่ถอนคืนยากตัวอื่น (user request 2026-08-07 ข้อ 3) */}
        {shipment.source === 'LINKED' && (
          <p className="mb-0 mt-3 flex items-start gap-2 rounded-lg bg-info/15 px-3 py-2 text-xs text-info-ink">
            <Icon icon="tabler:link" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
            ผูกจาก iShip — พัสดุใบนี้ถูกสร้างไว้ก่อนแล้ว ไม่ได้เปิดจากคำสั่งซื้อนี้
          </p>
        )}

        <ol className="mt-4 grid list-none grid-cols-4 ps-0">
          {SHIPMENT_STAGES.map((s, i) => {
            const reached = i <= progress.stage
            const isLast = i === SHIPMENT_STAGES.length - 1
            return (
              <li key={s.label} className="flex flex-col items-center gap-1.5">
                <div className="flex w-full items-center">
                  {/* เส้นเชื่อมซ้าย/ขวาของแต่ละจุด — ครึ่งซ้ายของจุดแรกและครึ่งขวาของจุดสุดท้าย
                      ต้องโปร่ง ไม่งั้นแถบจะยื่นเลยจุดปลายออกไปทั้งสองข้าง */}
                  <span
                    className={`h-0.5 flex-1 ${i === 0 ? 'bg-transparent' : reached ? STAGE_LINE[progress.tone] : 'bg-default-200'}`}
                  />
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
                      reached ? STAGE_DOT[progress.tone] : 'bg-default-100 text-default-400'
                    }`}
                  >
                    <Icon icon={s.icon} className="text-base" aria-hidden="true" />
                  </span>
                  <span
                    className={`h-0.5 flex-1 ${isLast ? 'bg-transparent' : i < progress.stage ? STAGE_LINE[progress.tone] : 'bg-default-200'}`}
                  />
                </div>
                <span
                  className={`text-center text-2xs leading-tight ${
                    i === progress.stage ? 'font-semibold text-default-900' : 'text-default-700'
                  }`}
                >
                  {isLast ? (progress.lastLabel ?? s.label) : s.label}
                </span>
              </li>
            )
          })}
        </ol>

        {progress.notice && (
          <p
            className={`mb-0 mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
              NOTICE_BOX[progress.notice.tone] ?? NOTICE_BOX.secondary
            }`}
          >
            <Icon icon="tabler:alert-circle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
            <span>{progress.notice.text}</span>
          </p>
        )}
      </section>

      {/* ── การเดินทาง ────────────────────────────────────────────────────── */}
      <section className="border-b-8 border-default-100 p-4">
        <div className="mb-3 flex items-center gap-2">
          <h4 className="text-default-700 mb-0 flex-1 text-xs font-semibold">การเดินทางของพัสดุ</h4>
          <button
            type="button"
            onClick={() => loadTraces()}
            disabled={loadingTraces}
            aria-label="โหลดสถานะล่าสุดอีกครั้ง"
            className="btn btn-icon text-default-700 hover:bg-default-100 disabled:opacity-50"
          >
            {loadingTraces ? (
              <span className="inline-block size-4 animate-spin rounded-full border-2 border-default-400 border-t-transparent" />
            ) : (
              <Icon icon="tabler:refresh" className="text-base" />
            )}
          </button>
        </div>

        {/* ระหว่างโหลดครั้งแรก — โครงเทาแทนความว่างเปล่า ไม่งั้นดูเหมือนไม่มีข้อมูล */}
        {traces === null && loadingTraces && (
          <div className="flex flex-col gap-2" aria-busy="true">
            <span className="h-4 w-2/3 animate-pulse rounded bg-default-100" />
            <span className="h-4 w-1/2 animate-pulse rounded bg-default-100" />
          </div>
        )}

        {shownTraces.length > 0 && (
          <ol className="flex list-none flex-col ps-0">
            {shownTraces.map((t, i) => (
              <li key={`${t.status}-${t.occurredAt}-${i}`} className="relative flex gap-3 pb-3 last:pb-0">
                {/* เส้นต่อระหว่างจุด — ตัวสุดท้ายไม่มี ไม่งั้นเส้นห้อยลงไปในที่ว่าง */}
                {i < shownTraces.length - 1 && (
                  <span className="bg-default-200 absolute start-1.5 top-4 bottom-0 w-0.5" aria-hidden="true" />
                )}
                <span
                  className={`relative z-1 mt-1 size-3 shrink-0 rounded-full ${
                    i === 0 ? 'bg-primary ring-primary/20 ring-3' : 'bg-default-300'
                  }`}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className={`mb-0 text-sm font-semibold ${i === 0 ? 'text-primary-ink' : 'text-default-900'}`}>
                    {t.statusText ?? t.status}
                  </p>
                  {t.statusDesc && <p className="text-default-700 mb-0 text-xs">{t.statusDesc}</p>}
                  <p className="text-default-700 mb-0 text-xs">
                    {formatRelativeDayTime(new Date(t.occurredAt))}
                    {t.location ? ` · ${t.location}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}

        {traces && traces.length > TRACE_PREVIEW && (
          <button
            type="button"
            onClick={() => setShowAllTraces((v) => !v)}
            aria-expanded={showAllTraces}
            className="btn text-primary mt-1 inline-flex items-center gap-1.5 p-0 text-sm hover:underline"
          >
            <Icon
              icon="tabler:chevron-down"
              className={`text-base transition-transform ${showAllTraces ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
            {showAllTraces ? 'ย่อการเดินทาง' : `ดูทั้งหมด ${traces.length} รายการ`}
          </button>
        )}

        {traces && traces.length === 0 && (
          <p className="text-default-700 mb-0 text-xs">
            ยังไม่มีข้อมูลการเดินทาง — ขนส่งจะอัปเดตหลังรับพัสดุเข้าระบบ
          </p>
        )}

        {/* ดึงไม่สำเร็จตอนเปิด (เงียบไว้ไม่เด้ง toast) — บอกตรงนี้แทน พร้อมทางกดเอง */}
        {traces === null && !loadingTraces && (
          <p className="text-default-700 mb-0 text-xs">
            ยังไม่ได้ข้อมูลการเดินทาง กดปุ่มรีเฟรชด้านบนเพื่อลองใหม่
          </p>
        )}
      </section>

      {/* ── ผู้รับ (user request 2026-08-07) ────────────────────────────────
          ข้อมูลชุดนี้ถูกโหลดมาพร้อม context อยู่แล้วทั้งสองที่ที่ใช้ component นี้ แต่ไม่เคย
          ถูกแสดง — เปิดหน้าต่างพัสดุแล้วตอบไม่ได้เลยว่ากำลังส่งให้ใคร ที่ไหน */}
      {hasReceiver && receiver && (
        <section className="border-b-8 border-default-100 p-4">
          <div className="mb-2 flex items-center gap-2">
            <h4 className="text-default-700 mb-0 flex-1 text-xs font-semibold">ผู้รับ</h4>
            <button
              type="button"
              onClick={handleCopyAddress}
              className="btn text-primary inline-flex items-center gap-1.5 p-0 text-xs hover:underline"
            >
              <Icon icon="tabler:copy" className="text-sm" aria-hidden="true" />
              คัดลอกที่อยู่
            </button>
          </div>
          {receiver.name && <p className="text-default-900 mb-0 text-sm font-semibold">{receiver.name}</p>}
          {receiver.phone && (
            // tel: — บนมือถือคือทางลัดโทรหาลูกค้าตอนของมีปัญหา ซึ่งเป็นเหตุผลหลักที่เปิดหน้านี้
            <a
              href={`tel:${receiver.phone}`}
              className="text-primary mt-0.5 inline-flex min-h-8 items-center gap-1.5 text-sm font-semibold"
            >
              <Icon icon="tabler:phone" className="text-base" aria-hidden="true" />
              {receiver.phone}
            </a>
          )}
          {addressLines.length > 0 && (
            <p className="text-default-800 mb-0 mt-1 text-sm leading-relaxed">
              {addressLines.map((l) => (
                <span key={l} className="block">
                  {l}
                </span>
              ))}
            </p>
          )}
        </section>
      )}

      {/* ── ในกล่อง + ยอดเก็บปลายทาง ───────────────────────────────────────── */}
      {(items?.length || shipment.codAmount > 0) && (
        <section className="border-b-8 border-default-100 p-4">
          {items && items.length > 0 && (
            <>
              <h4 className="text-default-700 mb-2 text-xs font-semibold">
                ในกล่อง{itemCount > 0 ? ` · ${itemCount} ชิ้น` : ''}
              </h4>
              {items.map((it) => (
                <div
                  key={it.id}
                  className="border-default-200 flex items-center gap-3 border-b border-dashed py-2 text-sm last:border-0"
                >
                  <span className="min-w-0 flex-1 truncate text-default-900">{it.name}</span>
                  <span className="text-default-700 shrink-0 text-xs">×{it.qty}</span>
                  <span className="text-default-900 shrink-0 font-semibold">
                    ฿{it.price.toLocaleString('th-TH')}
                  </span>
                </div>
              ))}
            </>
          )}
          {shipment.codAmount > 0 && (
            // ยอดที่ต้องเก็บจากลูกค้าปลายทาง = ตัวเลขที่ผิดแล้วเสียเงินจริง จึงเป็นแถบเต็มไม่ใช่แถวตาราง
            <div className="bg-warning/15 text-warning-ink mt-3 flex items-center justify-between gap-3 rounded-lg px-3 py-2.5">
              <span className="text-sm">เก็บเงินปลายทาง</span>
              <span className="text-base font-bold">฿{shipment.codAmount.toLocaleString('th-TH')}</span>
            </div>
          )}
        </section>
      )}

      {/* ── รายละเอียดพัสดุ (พับ) ───────────────────────────────────────────
          ค่าคงที่ที่อ่านครั้งเดียวก็พอ — เดิมกินกลางจอเป็นตาราง 6 บรรทัดตลอดเวลา
          สรุปย่อ (น้ำหนัก · ขนาด) อยู่บนหัวแถวเลย จะได้ไม่ต้องกดเปิดเพื่อดูสองค่าที่ถามบ่อยสุด */}
      <section className="border-b-8 border-default-100">
        <button
          type="button"
          onClick={() => setShowSpec((v) => !v)}
          aria-expanded={showSpec}
          className="btn flex min-h-12 w-full items-center gap-2 px-4 text-start text-sm text-default-800"
        >
          <Icon
            icon="tabler:chevron-down"
            className={`text-default-700 text-base transition-transform ${showSpec ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
          <span className="flex-1">รายละเอียดพัสดุ</span>
          {!showSpec && (
            <span className="text-default-700 truncate text-xs">
              {[
                shipment.weight != null ? `${shipment.weight} กก.` : null,
                shipment.width != null && shipment.length != null && shipment.height != null
                  ? `${shipment.width}×${shipment.length}×${shipment.height} ซม.`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
        </button>
        {showSpec && (
          <div className="px-4 pb-4">
            {/* ค่าที่ถูกส่งไปจริงตอนเปิดพัสดุ — ร้านตรวจย้อนได้ว่าเปิดใบนี้ด้วยขนาด/น้ำหนักเท่าไร
                สำคัญเวลาค่าส่งไม่ตรงที่คิด หรือขนส่งชั่งแล้วได้ไม่เท่าที่แจ้ง */}
            <StatRow label="ขนส่ง" value={courierLabel} />
            <StatRow label="สร้างเมื่อ" value={formatDateTime(new Date(shipment.createdAt))} />
            {shipment.carrierStatusAt && (
              <StatRow label="อัปเดตล่าสุด" value={formatDateTime(new Date(shipment.carrierStatusAt))} />
            )}
            {shipment.weight != null && <StatRow label="น้ำหนักที่แจ้ง" value={`${shipment.weight} กก.`} />}
            {shipment.width != null && shipment.length != null && shipment.height != null && (
              <StatRow
                label="ขนาดที่แจ้ง"
                value={`${shipment.width}×${shipment.length}×${shipment.height} ซม.`}
              />
            )}
            <StatRow
              label="พิมพ์ใบปะหน้าแล้ว"
              value={
                shipment.labelPrintedAt
                  ? `${shipment.labelPrintCount} ครั้ง · ${formatDateTime(new Date(shipment.labelPrintedAt))}`
                  : 'ยังไม่ได้พิมพ์'
              }
            />
          </div>
        )}
      </section>

      {/* ── แถบปุ่มติดขอบล่าง ──────────────────────────────────────────────
          sticky ไม่ใช่ fixed: ตัวที่เลื่อนคือกล่องของผู้เรียก (หน้าต่างในแชท / โมดัลในหน้า
          คำสั่งซื้อ) fixed จะไปยึด viewport แล้วลอยอยู่กลางจอในโหมดหน้าต่าง

          "ยกเลิกพัสดุ" ย้ายจากแถบเต็มความกว้างล่างสุดเข้ามาในเมนู ⋯ (user report 2026-08-07:
          "ปุ่มยกเลิก กดง่ายเกินไป และไม่ mobile friendly") — เดิมมันนั่งอยู่ตรงที่นิ้วโป้งพักพอดี
          ติดกับปุ่มหลัก ทั้งที่เป็นการกระทำที่ถอนคืนไม่ได้
          ตรงกับ docs/conventions/seller-action-placement.md: destructive อยู่ใน ⋯ + confirm เท่านั้น
          (mockup วาดเมนูไว้บนหัวหน้าต่าง แต่หัวนั้นเป็นของ DraftOrderProvider ซึ่งหน้าคำสั่งซื้อ
          ไม่มี — วางไว้ในแถบนี้แทน ได้ผลเรื่องกันกดพลาดเหมือนกันและใช้ได้ทั้งสองที่) */}
      <div className="bg-card border-default-300 sticky bottom-0 z-1 flex items-center gap-2 border-t p-3">
        {actions ? (
          <button
            type="button"
            onClick={handleCopy}
            disabled={!shipment.trackingNo}
            aria-label="คัดลอกเลขติดตาม"
            className="btn btn-icon bg-primary/15 text-primary-ink hover:bg-primary/25 shrink-0 disabled:opacity-50"
          >
            <Icon icon="tabler:copy" className="text-lg" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleCopy}
            disabled={!shipment.trackingNo}
            className="btn bg-primary/15 text-primary-ink hover:bg-primary/25 inline-flex flex-1 items-center justify-center gap-1.5 py-2.5 disabled:opacity-50"
          >
            <Icon icon="tabler:copy" className="text-base" aria-hidden="true" />
            คัดลอกเลข
          </button>
        )}

        <a
          href={`/api/seller/iship/shipments/${shipment.id}/label`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="พิมพ์ใบปะหน้า"
          title="พิมพ์ใบปะหน้า"
          className="btn btn-icon bg-primary/15 text-primary-ink hover:bg-primary/25 shrink-0"
        >
          <Icon icon="tabler:printer" className="text-lg" aria-hidden="true" />
        </a>

        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="ตัวเลือกเพิ่มเติมของพัสดุ"
            className="btn btn-icon text-default-700 hover:bg-default-100"
          >
            <Icon icon="tabler:dots-vertical" className="text-lg" aria-hidden="true" />
          </button>
          {menuOpen && (
            // bottom-full: เมนูกางขึ้นบนเสมอ ปุ่มอยู่ขอบล่างของกล่องอยู่แล้ว กางลงจะถูกตัดทิ้ง
            <div
              role="menu"
              className="border-default-300 bg-card absolute bottom-full end-0 z-10 mb-2 w-60 rounded-lg border p-1 shadow-lg"
            >
              {shipment.source === 'LINKED' && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => {
                    setMenuOpen(false)
                    void handleUnlink()
                  }}
                  className="dropdown-item min-h-11 text-sm disabled:opacity-50"
                >
                  <Icon icon="tabler:unlink" className="size-4" />
                  <span>ยกเลิกการผูก</span>
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  setMenuOpen(false)
                  void handleCancel()
                }}
                className="dropdown-item text-danger-ink min-h-11 text-sm disabled:opacity-50"
              >
                <Icon icon="tabler:package-off" className="size-4" />
                <span>ยกเลิกพัสดุ</span>
              </button>
            </div>
          )}
        </div>

        {actions && <div className="min-w-0 flex-1">{actions}</div>}
      </div>
    </div>
  )
}
