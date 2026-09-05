'use client'

/**
 * InspectionChecklist — บรรทัดสถานะข้อตรวจ + รายการเต็มจัดกลุ่มตามขั้น (feature 00060 · T14)
 *
 * Base: src/views/pages/user-profile/v2/EvidencePanel.tsx (`EvidenceLine`/`LineState`) — ขยาย
 * `LineState` เดิม (yes/partial/unknown/info) เป็น `CheckLineState` (yes/recheck/unknown/na) ตาม
 * UX-Design-Spec §Theme Source Mapping แถว "Status line + icon 5 สถานะ" — ใช้ไอคอน+สีชุดเดิมจาก
 * `verify-badge.ts` (VERIFY_BADGE_PALETTE) ไม่ประดิษฐ์ชุดสีใหม่ (HR16)
 *
 * 🛑 รูปทรงต่างกันไม่ใช่แค่สี (WCAG 1.4.1) — เหมือน `EvidenceLine` เป๊ะ: ทึบมีเช็ค (yes) /
 * วงกลมมีลูกศรหมุน (recheck) / เส้นประ (unknown) / ขีดกลาง (na)
 *
 * 🛑 ห้ามคำนวณสถานะเอง — `status`/`statusLabelTh` มาจาก `toPublicInspectionView()` แล้ว
 * (public-view.ts) component นี้แค่ map `PublicCheckStatus` (4 ค่า) → รูป/สี ไม่มีการเทียบเวลา/
 * expiresAt ในไฟล์นี้เลย
 */
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import { formatDateTH } from '@/lib/format-date'
import { VERIFY_BADGE_PALETTE } from '@/lib/verify-badge'
import type { PublicCheckStatus } from '@/lib/inspection/public-view'

import type { InspectionCheckGroupVM, InspectionCheckLineVM } from './inspection-view-vm'

export type CheckLineState = 'yes' | 'recheck' | 'unknown' | 'na'

/** `PublicCheckStatus` (4 ค่าที่ผู้ซื้อเห็น — FAIL ถูกยุบเข้า NO_DATA ไปแล้วที่ server) → รูป/สี */
export function resolveCheckLineState(status: PublicCheckStatus): CheckLineState {
  if (status === 'PASS') return 'yes'
  if (status === 'RECHECK') return 'recheck'
  if (status === 'NOT_APPLICABLE') return 'na'
  return 'unknown'
}

const STATE_ICON: Record<CheckLineState, string> = {
  yes: 'tabler:circle-check-filled',
  recheck: 'tabler:refresh',
  unknown: 'tabler:circle-dashed',
  na: 'tabler:minus-vertical',
}

const STATE_COLOR: Record<CheckLineState, string | undefined> = {
  yes: VERIFY_BADGE_PALETTE.green.fg,
  recheck: VERIFY_BADGE_PALETTE.gold.fg,
  unknown: undefined,
  na: undefined,
}

/**
 * บรรทัดเดียว — ใช้ทั้งพรีวิวบนการ์ดย่อ (`InspectionBlock`) และรายการเต็ม (`ShopExtraPages`)
 * `roomName` ไม่ null = ข้อนี้ผูกกับที่พักรายหลัง ต่อท้ายด้วย "· {roomName}" ตาม UX spec
 * `dense` = ตัวเล็กลง ใช้บนการ์ดย่อที่มีที่จำกัดกว่า full sheet
 */
export function InspectionCheckRow({
  line,
  roomName,
  dense,
}: {
  line: InspectionCheckLineVM
  roomName?: string | null
  dense?: boolean
}) {
  const state = resolveCheckLineState(line.status)
  // 🛑 ทุกแถวต้องมี **คำ** บอกสถานะ ไม่ใช่ไอคอนอย่างเดียว — ไอคอนเป็น `aria-hidden` (ถูกแล้ว
  //    เพราะรูปทรงซ้ำกับข้อความ) แต่เดิมแถว PASS ไม่มีคำว่า "ผ่าน" อยู่เลยสักที่ ⇒ ผู้ซื้อเห็น
  //    "✓ ข้อร้องเรียน · ตรวจล่าสุด 28 ส.ค." ซึ่ง **อ่านกลับด้านได้ว่า "ยืนยันแล้วว่ามีข้อร้องเรียน"**
  //    บนจอที่คนกำลังตัดสินใจโอนเงิน · และ screen reader ไม่ได้ยินสถานะเลยแม้แต่คำเดียว
  const dateTail =
    (line.status === 'PASS' || line.status === 'RECHECK') && line.lastVerifiedAt
      ? `${line.statusLabelTh} · ตรวจล่าสุด ${formatDateTH(line.lastVerifiedAt)}`
      : line.status === 'PASS'
        ? line.statusLabelTh
        : null

  return (
    <li className='flex items-start gap-2'>
      <Icon
        icon={STATE_ICON[state]}
        width={dense ? 15 : 17}
        style={{ flexShrink: 0, marginBlockStart: 2, color: STATE_COLOR[state] }}
        aria-hidden
      />
      <Typography
        className={dense ? 'text-[13px] min-is-0' : 'text-[15px] min-is-0'}
        style={{ lineHeight: 1.55 }}
        sx={{ color: state === 'unknown' || state === 'na' ? 'text.secondary' : 'text.primary' }}
      >
        <span className={state === 'na' ? 'font-normal' : 'font-semibold'}>
          {line.labelTh}
          {roomName && <span className='font-normal text-[var(--mui-palette-text-secondary)]'>{` · ${roomName}`}</span>}
        </span>
        {/* ป้ายรอตรวจซ้ำต้องมีคำ "รอตรวจซ้ำ · " นำหน้าวันที่เสมอ (UX spec Content outline)
            ส่วนป้ายไม่เกี่ยวข้อง/ยังไม่มีข้อมูล ไม่มีวันที่ต่อท้ายอยู่แล้ว (public-view.ts เคลียร์ไว้) */}
        {line.status === 'RECHECK' ? (
          <span className='block text-[13px] text-[var(--mui-palette-text-secondary)] tabular-nums'>
            {`รอตรวจซ้ำ · ยืนยันล่าสุด ${line.lastVerifiedAt ? formatDateTH(line.lastVerifiedAt) : '—'}`}
          </span>
        ) : dateTail ? (
          <span className='block text-[13px] text-[var(--mui-palette-text-secondary)] tabular-nums'>{dateTail}</span>
        ) : line.status === 'NOT_APPLICABLE' || line.status === 'NO_DATA' ? (
          <span className='block text-[13px] text-[var(--mui-palette-text-secondary)]'>{line.statusLabelTh}</span>
        ) : null}
      </Typography>
    </li>
  )
}

/** รายการเต็มจัดกลุ่มตามขั้น — ใช้ในหน้าเต็มจอ (`ShopExtraPages` tab `'inspection'`) เท่านั้น */
export default function InspectionChecklist({ groups }: { groups: InspectionCheckGroupVM[] }) {
  if (groups.length === 0) return null

  return (
    <div className='flex flex-col gap-6'>
      {groups.map((g) => (
        <section key={g.step}>
          <Typography component='h4' className='text-[13px] font-extrabold mbe-3' color='text.secondary'>
            {g.stepLabelTh}
          </Typography>
          <ul className='flex flex-col gap-3 m-0 p-0 list-none'>
            {g.lines.map(({ line, roomName }) => (
              <InspectionCheckRow key={`${line.checkKey}-${roomName ?? ''}`} line={line} roomName={roomName} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
