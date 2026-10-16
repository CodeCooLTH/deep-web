/**
 * DeskToolbar — แถบเครื่องมือมุมขวาบนของเวที: หมุน · ซูมออก · ซูมเข้า │ ตัวกรอง · ตัวเลข · เต็มจอ
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx (Button Group = inline-flex + btn btn-icon — Paces ไม่มี .btn-group)
 *   + พฤติกรรมเต็มจอจาก theme/paces/Admin/TS/src/layouts/components/TopBar/components/FullscreenToggler.tsx
 * "ตัวเลข" = ปุ่มสลับ aria-pressed (เปิด = bg-primary/15 ไม่ใช่ปุ่มทึบถาวร — One Voice) · ปุ่มเต็มจอซ่อนเมื่อไม่รองรับ
 */
import Icon from '@/components/wrappers/Icon'
import type { ReactNode } from 'react'

export const ZOOM_MIN = 0.6
export const ZOOM_MAX = 3

export type DeskToolbarProps = {
  zoom: number
  onRotate: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  hideNumbers: boolean
  onToggleNumbers: () => void
  fullscreen: { supported: boolean; active: boolean; toggle: () => void }
  /** ปุ่มตัวกรอง + popover (DeskFilters variant="icon") — อยู่ใน element เดียวกับเวทีเพื่อให้เห็นตอนเต็มจอ */
  filterSlot: ReactNode
}

const BTN = 'btn btn-icon text-default-900 hover:bg-light rounded-none bg-transparent'

export default function DeskToolbar({ zoom, onRotate, onZoomIn, onZoomOut, hideNumbers, onToggleNumbers, fullscreen, filterSlot }: DeskToolbarProps) {
  return (
    <div role="toolbar" aria-label="เครื่องมือฉาก" className="bg-card divide-default-200 inline-flex items-stretch divide-x rounded-lg shadow">
      <button type="button" aria-label="หมุนมุมมอง" onClick={onRotate} className={`${BTN} rounded-s-lg`}>
        <Icon icon="rotate-clockwise" className="text-lg" aria-hidden="true" />
      </button>
      <button type="button" aria-label="ซูมออก" disabled={zoom <= ZOOM_MIN} onClick={onZoomOut} className={BTN}>
        <Icon icon="zoom-out" className="text-lg" aria-hidden="true" />
      </button>
      <button type="button" aria-label="ซูมเข้า" disabled={zoom >= ZOOM_MAX} onClick={onZoomIn} className={BTN}>
        <Icon icon="zoom-in" className="text-lg" aria-hidden="true" />
      </button>
      <span className="bg-default-200 w-1.5" aria-hidden="true" />
      {filterSlot}
      <button
        type="button"
        aria-label="แสดงตัวเลขบนฉาก"
        aria-pressed={!hideNumbers}
        onClick={onToggleNumbers}
        className={`${BTN} ${hideNumbers ? '' : 'bg-primary/15 text-primary'} ${fullscreen.supported ? '' : 'rounded-e-lg'}`}
      >
        <Icon icon="numbers" className="text-lg" aria-hidden="true" />
      </button>
      {fullscreen.supported && (
        <button type="button" aria-label={fullscreen.active ? 'ออกจากเต็มจอ' : 'เต็มจอ'} onClick={fullscreen.toggle} className={`${BTN} rounded-e-lg`}>
          <Icon icon={fullscreen.active ? 'minimize' : 'maximize'} className="text-lg" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
