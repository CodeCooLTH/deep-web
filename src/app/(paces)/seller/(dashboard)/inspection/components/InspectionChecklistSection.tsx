/**
 * InspectionChecklistSection — ผลตรวจรายข้อ แยกระดับร้าน/รายที่พัก (feature 00060 · T12)
 *
 * Base (โครง card + badge แถว): Paces badge primitive (§6 ของ paces-component-reference.md)
 *   ผ่าน src/components/table/DataTable badge-in-cell pattern (`badge bg-{color}/15 text-{color}-ink`)
 * Base (ตัวเลือกที่พัก): src/components/safepay/FilterDropdown.tsx (Base เดิม = SingleButtonDropdowns)
 *
 * 🛑 ห้าม derive `displayStatus` เอง — ทุกค่าที่แสดงมาจาก server แล้ว (API.md §3.2 ค)
 * 🛑 กรองเหลือเฉพาะข้อของขั้นที่ไม่เกินขั้นปัจจุบันของร้าน (มิเรอร์ full-sheet ฝั่งสาธารณะ) —
 *    ร้านขั้น 1 ไม่ควรเห็นข้อของขั้น 2-4 เป็น "ยังไม่มีข้อมูล" ซึ่งจะอ่านเหมือนช่องโหว่ทั้งที่
 *    ร้านยังไม่ได้ซื้อขั้นนั้น
 *
 * 🛑 การตัดสินใจที่สเปกไม่ได้ระบุตรง ๆ — สี "ไม่ผ่าน" ฝั่งร้าน: Impeccable compliance ของสเปกนี้
 *    เขียนไว้ว่า "แดงสงวนให้ overdue ของผู้ตรวจ (internal ops) และ pacesConfirm.danger เท่านั้น"
 *    ⇒ ไม่ใช้ badge สีแดงกับแถว "ไม่ผ่าน" ที่นี่ (ใช้ neutral/default แทน) แต่ยังคง label "ไม่ผ่าน"
 *    แยกจาก "ยังไม่มีข้อมูล" ตามที่ Controller สั่งห้ามยุบ — ต่างจากฝั่งสาธารณะที่ยุบให้เหมือนกันเป๊ะ
 *    (design decision #1 ของสเปกนี้สงวนไว้เฉพาะ "บนหน้าจอสาธารณะ" เท่านั้น ไม่ครอบฝั่งร้าน)
 */
'use client'

import { useState } from 'react'
import { API_DISPLAY_STATUS_LABEL_TH } from '@/lib/inspection/result-status'
import FilterDropdown from '@/components/safepay/FilterDropdown'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import { formatDateTH } from '@/lib/format-date'
import {
  INSPECTION_CHECKS,
  INSPECTION_CHECK_KEYS,
  INSPECTION_STEP_LABEL_TH,
} from '@/lib/inspection/checks'
import type { InspectionCheckKey, InspectionStep } from '@/lib/inspection/checks'
import type {
  ApiDisplayStatus,
  CheckResultJSON,
  InspectionPlanJSON,
  PendingRoundJSON,
  RoomResultJSON,
} from './types'

type StatusConfig = { label: string; icon: string; cls: string }

// soft badge — bg-{color}/15 + text-{color}-ink ตาม §6 ของ component reference (ห้าม text-{color} เปล่า)
const STATUS_CONFIG: Record<ApiDisplayStatus, StatusConfig> = {
  PASS: { label: API_DISPLAY_STATUS_LABEL_TH.PASS, icon: 'circle-check', cls: 'bg-success/15 text-success-ink' },
  // ไม่ใช้แดง — ดูคอมเมนต์หัวไฟล์ (การตัดสินใจของ dev เพราะสเปกไม่ได้ระบุสีตรง ๆ)
  FAIL: { label: API_DISPLAY_STATUS_LABEL_TH.FAIL, icon: 'circle-x', cls: 'bg-default-200 text-default-700' },
  RECHECK_DUE: { label: API_DISPLAY_STATUS_LABEL_TH.RECHECK_DUE, icon: 'refresh', cls: 'bg-warning/15 text-warning-ink' },
  NO_DATA: { label: API_DISPLAY_STATUS_LABEL_TH.NO_DATA, icon: 'circle-dashed', cls: 'bg-default-100 text-default-500' },
  NOT_APPLICABLE: {
    label: API_DISPLAY_STATUS_LABEL_TH.NOT_APPLICABLE,
    icon: 'minus',
    // เฉดเดียวกับ NO_DATA โดยตั้งใจ — ตัวแบกความหมายคือไอคอน (minus vs circle-dashed) ไม่ใช่เฉดสี
    cls: 'bg-default-100 text-default-500',
  },
}

// สถานะที่ 6 เฉพาะฝั่งร้าน — ไม่ส่งออกไปสาธารณะ (มีรอบตรวจเปิดอยู่ครอบข้อนั้น)
const IN_PROGRESS_CONFIG: StatusConfig = { label: 'กำลังตรวจ', icon: 'clock-hour-3', cls: 'bg-info/15 text-info-ink' }

type Group = { step: InspectionStep; label: string; results: CheckResultJSON[] }

/** กรองเหลือเฉพาะขั้นที่ไม่เกินขั้นปัจจุบันของแผน แล้วจัดกลุ่มตามขั้น (เรียง 1→4) */
function groupByStep(results: CheckResultJSON[], maxStep: InspectionStep): Group[] {
  const visible = results.filter((r) => INSPECTION_CHECKS[r.checkKey].step <= maxStep)
  const steps = Array.from(new Set(visible.map((r) => INSPECTION_CHECKS[r.checkKey].step))).sort(
    (a, b) => a - b,
  ) as InspectionStep[]
  return steps.map((step) => ({
    step,
    label: INSPECTION_STEP_LABEL_TH[step],
    results: visible.filter((r) => INSPECTION_CHECKS[r.checkKey].step === step),
  }))
}

/**
 * ข้อตรวจที่ "มีรอบตรวจเปิดอยู่ครอบข้อนั้น" — GET /api/seller/inspection ไม่ส่ง checkKeys ของ
 * pendingRounds มาให้ (ดู API.md §4.6 ที่ endpoint คนละตัวถึงมี checkKeys) จึง derive จาก
 * (step, method, scope) ของรอบนั้นเทียบกับ SSOT ที่นี่ — 🛑 ต้องกรอง scope ด้วย ไม่ใช่แค่
 * (step, method) เพราะ step 1/method AUTO มีข้อ scope SHOP 5 ข้อ + scope ROOM 1 ข้อ
 * (duplicate_listing) ปนกันอยู่ — รอบ roomId=null ครอบเฉพาะฝั่ง SHOP, รอบ roomId=X ครอบเฉพาะ
 * ฝั่ง ROOM ของห้องนั้น
 */
function pendingCheckKeys(
  pendingRounds: PendingRoundJSON[],
  scope: 'SHOP' | 'ROOM',
  roomId: string | null,
): Set<InspectionCheckKey> {
  const set = new Set<InspectionCheckKey>()
  for (const round of pendingRounds) {
    const roundScope: 'SHOP' | 'ROOM' = round.roomId === null ? 'SHOP' : 'ROOM'
    if (roundScope !== scope) continue
    if (scope === 'ROOM' && round.roomId !== roomId) continue
    for (const key of INSPECTION_CHECK_KEYS) {
      const def = INSPECTION_CHECKS[key]
      if (def.step === round.step && def.method === round.method && def.scope === scope) set.add(key)
    }
  }
  return set
}

function CheckRow({ result, inProgress }: { result: CheckResultJSON; inProgress: boolean }) {
  const config = inProgress ? IN_PROGRESS_CONFIG : STATUS_CONFIG[result.displayStatus]
  const metaLabel =
    result.displayStatus === 'RECHECK_DUE'
      ? 'ยืนยันล่าสุด'
      : result.displayStatus === 'PASS' || result.displayStatus === 'FAIL'
        ? 'ตรวจล่าสุด'
        : null

  return (
    <li className="flex flex-wrap items-start justify-between gap-2 py-2.5 border-b border-dashed border-default-200 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-default-800 text-sm">{INSPECTION_CHECKS[result.checkKey].labelTh}</p>
        {!inProgress && metaLabel && result.lastCheckedAt && (
          <p className="text-default-400 text-xs mt-0.5">
            {metaLabel} {formatDateTH(result.lastCheckedAt)}
            {result.inspectorDisplayName ? ` · ตรวจโดย ${result.inspectorDisplayName}` : ''}
            {/* 🛑 วันหมดอายุถูกส่งมาถึงหน้าจอตั้งแต่แรกแต่ไม่เคยถูกแสดง (พบตอน critique) —
                ร้านจึงรู้ตัวว่าป้ายกำลังจะร่วง **ก็ต่อเมื่อมันร่วงไปแล้ว** ทั้งที่ข้อมูลอยู่ในมือ
                ⇒ แสดงเฉพาะข้อที่ยังผ่านอยู่ (ข้อที่ตกไปแล้ววันหมดอายุไม่มีความหมาย) */}
            {result.displayStatus === 'PASS' && result.expiresAt
              ? ` · ตรวจซ้ำก่อน ${formatDateTH(result.expiresAt)}`
              : ''}
          </p>
        )}
        {/* "รอตรวจซ้ำ" มีได้ 2 สาเหตุและร้านต้องแยกออก: ผลเก่าเกินกำหนด (รอคิวผู้ตรวจ) กับ
            ร้านเปลี่ยนภาพประกาศเอง (FR-INS-028) — อย่างหลังร้านเป็นคนทำ จึงต้องบอกตรง ๆ
            ไม่งั้นร้านจะอ่านว่าระบบตัดป้ายเขาโดยไม่มีเหตุผล */}
        {!inProgress && result.displayStatus === 'RECHECK_DUE' && (
          <p className="text-default-400 text-xs mt-0.5">
            {result.checkKey === 'photos_match'
              ? 'ภาพประกาศถูกแก้ไขหลังการตรวจครั้งล่าสุด — รอผู้ตรวจยืนยันภาพชุดใหม่'
              : 'ผลตรวจครบกำหนดต้องยืนยันซ้ำ — ระบบจัดคิวผู้ตรวจให้อัตโนมัติ'}
          </p>
        )}
      </div>
      <span className={cn('badge shrink-0 inline-flex items-center gap-1', config.cls)}>
        <Icon icon={config.icon} className="size-3.5" />
        {config.label}
      </span>
    </li>
  )
}

type Props = {
  plan: InspectionPlanJSON
  shopResults: CheckResultJSON[]
  roomResults: RoomResultJSON[]
  pendingRounds: PendingRoundJSON[]
}

export default function InspectionChecklistSection({ plan, shopResults, roomResults, pendingRounds }: Props) {
  const [selectedRoomId, setSelectedRoomId] = useState(roomResults[0]?.roomId ?? '')

  // ยังไม่ได้สมัครแผน — ไม่มี "ขั้นปัจจุบัน" ให้ใช้กรอง จึงไม่มีผลตรวจที่ควรแสดง
  if (plan === null) return null

  const shopGroups = groupByStep(shopResults, plan.step)
  const selectedRoom = roomResults.find((r) => r.roomId === selectedRoomId) ?? roomResults[0] ?? null
  const roomGroups = selectedRoom ? groupByStep(selectedRoom.results, plan.step) : []

  const shopPending = pendingCheckKeys(pendingRounds, 'SHOP', null)
  const roomPending = selectedRoom ? pendingCheckKeys(pendingRounds, 'ROOM', selectedRoom.roomId) : new Set<InspectionCheckKey>()

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">ผลตรวจรายข้อ</h4>
      </div>
      <div className="card-body space-y-6">
        {/* ผลตรวจของร้าน — scope SHOP ใช้ร่วมกับที่พักทุกหลัง */}
        <div>
          <p className="text-default-500 mb-2 text-sm font-semibold">ผลตรวจของร้าน</p>
          {shopGroups.map((group) => (
            <div key={group.step} className="mb-4 last:mb-0">
              <p className="text-default-400 mb-1 text-xs font-medium">{group.label}</p>
              <ul>
                {group.results.map((r) => (
                  <CheckRow key={r.checkKey} result={r} inProgress={shopPending.has(r.checkKey)} />
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* ผลตรวจของที่พัก — scope ROOM ผูกรายหลัง (BR §D-16 / AC-INS-29) */}
        {roomResults.length > 0 && (
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-default-500 text-sm font-semibold">ผลตรวจของที่พัก</p>
              {roomResults.length > 1 && (
                <FilterDropdown
                  icon="home"
                  value={selectedRoom?.roomId ?? ''}
                  options={roomResults.map((r) => ({ value: r.roomId, label: r.roomName }))}
                  onChange={setSelectedRoomId}
                />
              )}
            </div>
            {roomResults.length === 1 && (
              <p className="text-default-400 mb-2 text-xs">{roomResults[0].roomName}</p>
            )}
            {roomGroups.map((group) => (
              <div key={group.step} className="mb-4 last:mb-0">
                <p className="text-default-400 mb-1 text-xs font-medium">{group.label}</p>
                <ul>
                  {group.results.map((r) => (
                    <CheckRow key={r.checkKey} result={r} inProgress={roomPending.has(r.checkKey)} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
