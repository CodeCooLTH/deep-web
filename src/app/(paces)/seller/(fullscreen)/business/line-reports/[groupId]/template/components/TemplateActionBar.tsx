'use client'

/**
 * TemplateActionBar — ปุ่มของหน้าจัดข้อความ: render สองที่ด้วย props ชุดเดียวกันจาก `getPrimaryAction`
 *   · `desktop` (≥lg) ใน toolbarExtra: (chip ยังไม่บันทึก) ⋯ · ยกเลิกการแก้ · ส่งทดสอบ · บันทึกเทมเพลต
 *   · `mobile` (<lg) ใน belowContent: [ผืนงาน|ตัวอย่าง (<md)] ⋯ [primary ช่องเดียวเปลี่ยนตามสถานะ]
 *
 * Base: src/app/(paces)/seller/(dashboard)/business/line-reports/_components/detail/DetailActionBar.tsx (ปุ่ม btn primary/outline + loader)
 *   + src/app/(paces)/seller/(fullscreen)/public-profile/builder/components/BuilderToolbar.tsx (toolbarExtra ≥lg + belowContent <lg)
 *   + docs/conventions/seller-action-placement.md §2 (⋯ → secondary → PRIMARY) · theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx
 * ลำดับปุ่มบนเดสก์ท็อปคงที่ตามสเปก §3.2 (ส่งทดสอบ → บันทึกเทมเพลต) เพื่อไม่ให้ปุ่มกระโดดตามสถานะ
 * ห้ามมี primary สองปุ่ม — class primary มาจาก `action.primary` ค่าเดียว
 */
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import type { PrimaryAction } from '../lib/primary-action'
import SegControl from './SegControl'
import TemplateMenu, { type MenuItem } from './TemplateMenu'

const PRIMARY = 'btn bg-primary hover:bg-primary-hover inline-flex min-h-11 items-center gap-1.5 text-white lg:min-h-0 disabled:opacity-60'
const OUTLINE = 'btn border-default-300 text-default-700 hover:bg-default-100 inline-flex min-h-11 items-center gap-1.5 border lg:min-h-0 disabled:opacity-60'

export type ActionBarProps = {
  action: PrimaryAction
  dirty: boolean
  saving: boolean
  testing: boolean
  hasCustom: boolean
  view: 'canvas' | 'preview'
  onView: (v: 'canvas' | 'preview') => void
  onSave: () => void
  onTest: () => void
  onDiscard: () => void
  onReset: () => void
  /** id ของข้อความเหตุผลที่ปุ่มชี้ด้วย aria-describedby */
  reasonId: string
}

function SaveLabel({ saving }: { saving: boolean }) {
  return (
    <>
      <Icon icon={saving ? 'loader-2' : 'device-floppy'} className={cn('text-base', saving && 'animate-spin')} aria-hidden="true" />
      {saving ? 'กำลังบันทึก…' : 'บันทึกเทมเพลต'}
    </>
  )
}

function TestLabel({ testing }: { testing: boolean }) {
  return (
    <>
      <Icon icon={testing ? 'loader-2' : 'send'} className={cn('text-base', testing && 'animate-spin')} aria-hidden="true" />
      ส่งทดสอบ
    </>
  )
}

function resetItem(p: ActionBarProps): MenuItem {
  const off = !p.hasCustom && !p.dirty
  return {
    key: 'reset',
    label: 'คืนเป็นแบบมาตรฐาน',
    sub: off ? 'ใช้แบบมาตรฐานอยู่แล้ว' : undefined,
    icon: 'refresh',
    disabled: off || p.saving,
    danger: true,
    onClick: p.onReset,
  }
}

export function DesktopActions(p: ActionBarProps) {
  const { action } = p
  const saveIsPrimary = action.primary === 'save'
  const testIsPrimary = action.primary === 'test'
  const items: MenuItem[] = [resetItem(p)]
  return (
    <>
      {p.dirty && action.save.visible && (
        <span className="badge bg-warning/15 text-warning-ink" role="status">
          ยังไม่บันทึก · บันทึกก่อนส่งทดสอบ
        </span>
      )}
      <TemplateMenu items={items} />
      {p.dirty && !p.saving && (
        <button type="button" onClick={p.onDiscard} className={OUTLINE}>
          ยกเลิกการแก้
        </button>
      )}
      <button
        type="button"
        onClick={p.onTest}
        disabled={action.test.disabled}
        title={action.test.reason ?? undefined}
        aria-describedby={action.test.reason ? p.reasonId : undefined}
        className={testIsPrimary ? PRIMARY : OUTLINE}
      >
        <TestLabel testing={p.testing} />
      </button>
      {action.save.visible && (
        <button
          type="button"
          onClick={p.onSave}
          disabled={action.save.disabled}
          title={action.save.reason ?? undefined}
          aria-describedby={action.save.reason ? p.reasonId : undefined}
          className={saveIsPrimary ? PRIMARY : OUTLINE}
        >
          <SaveLabel saving={p.saving} />
        </button>
      )}
    </>
  )
}

export function MobileActions(p: ActionBarProps) {
  const { action } = p
  // ช่อง primary เดียว: dirty/บันทึกอยู่ = บันทึก · อ่านอย่างเดียว = ส่งทดสอบ (disabled) · stale = บันทึก (disabled)
  const slot: 'save' | 'test' = action.primary === 'save' ? 'save' : action.primary === 'test' ? 'test' : action.save.visible ? 'save' : 'test'
  const items: MenuItem[] = []
  // ส่งทดสอบตอน dirty ไปอยู่ในเมนูแบบ disabled พร้อมเหตุผล (ไม่หายจากระบบ)
  if (slot === 'save') items.push({ key: 'test', label: 'ส่งทดสอบ', sub: action.test.reason ?? undefined, icon: 'send', disabled: action.test.disabled, onClick: p.onTest })
  if (p.dirty && !p.saving) items.push({ key: 'discard', label: 'ยกเลิกการแก้', icon: 'arrow-back-up', onClick: p.onDiscard })
  items.push(resetItem(p))
  const view = (
    <SegControl
      label="เลือกมุมมอง"
      fill
      className="min-w-0 flex-1 md:hidden"
      value={p.view}
      onChange={p.onView}
      options={[
        { value: 'canvas', label: 'ข้อความ' },
        { value: 'preview', label: 'ตัวอย่าง' },
      ]}
    />
  )
  return (
    <div className="mt-3 flex items-center gap-2 lg:hidden">
      {view}
      <span className="hidden flex-1 md:block" />
      <TemplateMenu items={items} />
      {slot === 'save' ? (
        <button
          type="button"
          onClick={p.onSave}
          disabled={action.save.disabled}
          title={action.save.reason ?? undefined}
          aria-describedby={action.save.reason ? p.reasonId : undefined}
          className={PRIMARY}
        >
          <SaveLabel saving={p.saving} />
        </button>
      ) : (
        <button
          type="button"
          onClick={p.onTest}
          disabled={action.test.disabled}
          title={action.test.reason ?? undefined}
          aria-describedby={action.test.reason ? p.reasonId : undefined}
          className={PRIMARY}
        >
          <TestLabel testing={p.testing} />
        </button>
      )}
    </div>
  )
}
