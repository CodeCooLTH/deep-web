'use client'

/**
 * FlashModePanel — แท็บ "โหมดและใบปะหน้า" ของโมดัลตั้งค่า Flash (แยกไฟล์ให้โมดัลหลักไม่เกิน ~400 บรรทัด)
 * radio-card โครงเดียวกับ CREATE_MODES ของ ShippingSettingsRow
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx
 *       settings/ShippingSettingsRow.tsx
 */

import Icon from '@/components/wrappers/Icon'
import { NOTICE_BOX } from '@/components/safepay/iship/tone'
import type { FlashSettings } from '@/services/flash.service'

export const CREATE_MODES = [
  { value: 'OFF', label: 'ปิดไว้ก่อน', icon: 'player-pause',
    hint: 'ไม่ทำอะไรอัตโนมัติ กดสร้างพัสดุเองได้จากหน้ารายละเอียดคำสั่งซื้อและหน้าแชท' },
  { value: 'ASK', label: 'ถามทุกครั้ง', icon: 'help-circle',
    hint: 'สร้างคำสั่งซื้อเสร็จ ระบบจะถามยืนยันก่อน ให้ตรวจข้อมูลและแก้ได้ก่อนเปิดพัสดุ' },
  { value: 'AUTO', label: 'สร้างพัสดุอัตโนมัติ', icon: 'bolt',
    hint: 'เปิดพัสดุที่ Flash ให้ทันทีที่บันทึกคำสั่งซื้อที่เข้าเงื่อนไข โดยไม่ถาม มีค่าใช้จ่ายจริงทุกครั้ง' },
] as const

export const LABEL_SIZES = [
  { value: 'BIG', label: '100×180 มม. (ค่าเริ่มต้น)', hint: 'ขนาดมาตรฐานของ Flash เหมาะกับเครื่องพิมพ์ใบปะหน้าทั่วไป' },
  { value: 'SMALL', label: '100×75 มม.', hint: 'ใบเล็ก สำหรับเครื่องพิมพ์สติกเกอร์ขนาดเล็ก' },
] as const

/** แถวอ่านค่า (ผู้ที่ไม่ใช่เจ้าของ) — เส้นประแบบ StatRow ของ ShipmentStatusView */
export function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-dashed border-default-300 py-2 text-sm last:border-b-0">
      <span className="shrink-0 text-default-600">{label}</span>
      <span className="min-w-0 break-words text-end text-default-900">{value || '—'}</span>
    </div>
  )
}

export default function FlashModePanel({
  active, isOwner, labelSize, createMode, ishipConnected, onChange,
}: {
  active: boolean
  isOwner: boolean
  labelSize: FlashSettings['labelSize']
  createMode: FlashSettings['createMode']
  ishipConnected: boolean
  onChange: (p: Partial<FlashSettings>) => void
}) {
  return (
            <div id="flash-panel-mode" role="tabpanel" className={active ? '' : 'hidden'}>
        {!isOwner ? (
          <div>
            <ReadRow label="ขนาดใบปะหน้า" value={LABEL_SIZES.find((l) => l.value === labelSize)?.label ?? ''} />
            <ReadRow label="โหมดการสร้างพัสดุ" value={CREATE_MODES.find((m) => m.value === createMode)?.label ?? ''} />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="form-label">ขนาดใบปะหน้า</legend>
              {LABEL_SIZES.map((l) => (
                <label key={l.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                    labelSize === l.value ? 'border-primary bg-primary/10' : 'border-default-200'
                  }`}>
                  <input type="radio" name="flash-label-size" className="form-radio mt-0.5"
                    checked={labelSize === l.value} onChange={() => onChange({ labelSize: l.value })} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-default-800">{l.label}</span>
                    <span className="mt-0.5 block text-xs text-default-600">{l.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="form-label">โหมดการสร้างพัสดุ</legend>
              {CREATE_MODES.map((m) => (
                <label key={m.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                    createMode === m.value ? 'border-primary bg-primary/10' : 'border-default-200'
                  }`}>
                  <input type="radio" name="flash-create-mode" className="form-radio mt-0.5"
                    checked={createMode === m.value} onChange={() => onChange({ createMode: m.value })} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-default-800">
                      <Icon icon={m.icon} className="text-base" aria-hidden="true" />
                      {m.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-default-600">{m.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          </div>
        )}
        {ishipConnected && (
          <p className={`mb-0 mt-4 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${NOTICE_BOX.info}`}>
            <Icon icon="info-circle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
            ร้านที่เชื่อมทั้ง iShip และ Flash จะถูกถามให้เลือกผู้ให้บริการทุกครั้ง แม้ตั้งเป็นอัตโนมัติ
          </p>
        )}
      </div>
  )
}
