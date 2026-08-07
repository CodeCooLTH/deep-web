'use client'

/**
 * ShortcutEditSheet — โหมดแก้ไขเมนูลัด (feature 00027)
 *
 * Design Spec: docs/superpowers/specs/2026-08-02-shortcut-edit-sheet-design-spec.md
 *
 * Shell: copy จาก SalesChartSheet.tsx (fixed inset-0 z-80 flex flex-col bg-card,
 *   header back-chevron + title, ESC ปิด, role="dialog", safe-area ที่ scroll container)
 * แถว toggle: copy จาก expenses/components/ExpenseCategoryFilterSheet.tsx (`FilterRow`)
 *   ปรับจาก single-select (aria-pressed) เป็น add/remove — ทั้งแถวคือ tap target เดียว ≥44px
 * Skeleton: SalesChartSheet.tsx (animate-pulse rounded-lg bg-default-100)
 *
 * ทำไมเป็น full-screen ไม่ใช่ sheet เตี้ยแบบ ExpenseCategoryFilterSheet: แคตตาล็อกยาวได้ถึง
 * ~24 รายการ + ที่ปักไว้อีก 8 ต้องการพื้นที่สกรอลล์เต็มจอ ไม่ใช่ quick-pick สั้น ๆ
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'
import { getShortcutTileIcon } from '../_constants/shortcut-icons'
import type { ShortcutStateDto } from '../_constants/command-center'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'

type Props = {
  onClose: () => void
  /** แจ้ง parent ทุกครั้งที่สถานะเปลี่ยนสำเร็จ — การ์ดข้างหลังอัปเดตทันทีโดยไม่ต้อง reload */
  onSync: (state: ShortcutStateDto) => void
}

const ENDPOINT = '/api/shops/current/shortcuts'

export default function ShortcutEditSheet({ onClose, onSync }: Props) {
  // overlay นี้ mount เฉพาะตอนเปิด จึงตรึงหน้าข้างหลังตลอดอายุของมัน (ดู useLockBodyScroll)
  useLockBodyScroll(true)

  const [state, setState] = useState<ShortcutStateDto | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  /** slug ที่กำลังรอ response — ใช้โชว์ spinner ในแถวนั้นและกันแตะซ้ำ */
  const [pending, setPending] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)

  /**
   * เก็บ onSync ไว้ใน ref — parent ส่ง arrow function ใหม่ทุก render ถ้าเอาไปใส่ deps ของ
   * useCallback/useEffect ตรง ๆ จะได้ลูปยิง API ไม่รู้จบ (fetch -> setState -> re-render ->
   * onSync identity ใหม่ -> fetch ใหม่) — pattern เดียวกับ busyRef ใน ExpenseFormModal
   */
  const onSyncRef = useRef(onSync)
  useEffect(() => {
    onSyncRef.current = onSync
  }, [onSync])

  const load = useCallback(async () => {
    setLoadFailed(false)
    try {
      const res = await fetch(ENDPOINT, { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const data: ShortcutStateDto = await res.json()
      setState(data)
      onSyncRef.current(data)
    } catch {
      setLoadFailed(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  /** mutation ทุกตัวคืน state ชุดเดียวกัน — sync จาก response ตรง ๆ ไม่เดาผลลัพธ์เอง */
  async function mutate(url: string, opts: { onDone?: () => void } = {}) {
    try {
      const res = await fetch(url, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        pacesToast.error(data?.error ?? 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง')
        // สิทธิ์เปลี่ยนกลางอากาศ (เช่นถูกลดสิทธิ์ระหว่างเปิดชีตค้างไว้) — catalog ที่ถืออยู่เก่าแล้ว
        // ต้องโหลดใหม่ ไม่ปล่อยให้ผู้ใช้กดจากรายการที่ไม่มีจริงต่อ
        if (data?.code === 'SLUG_NOT_IN_CATALOG') await load()
        // ปัญหาระดับ session/ร้าน แก้ในหน้านี้ไม่ได้ — ปิดชีตไปเลย
        if (res.status === 401 || res.status === 404) onClose()
        return false
      }
      setState(data)
      onSyncRef.current(data)
      opts.onDone?.()
      return true
    } catch {
      pacesToast.error('เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง')
      return false
    }
  }

  async function togglePin(slug: string, action: 'pin' | 'unpin') {
    if (pending) return
    setPending(slug)
    await mutate(`${ENDPOINT}/${slug}/${action}`)
    setPending(null)
  }

  async function handleReset() {
    const ok = await pacesConfirm.warning(
      'รีเซ็ตเมนูลัดกลับเป็นค่าเริ่มต้น?',
      'เมนูลัดที่เลือกไว้ตอนนี้จะถูกแทนที่ด้วยค่าเริ่มต้นทั้งหมด',
    )
    if (!ok) return
    setResetting(true)
    await mutate(`${ENDPOINT}/reset`, {
      onDone: () => pacesToast.success('รีเซ็ตเมนูลัดเรียบร้อย'),
    })
    setResetting(false)
  }

  // ─── derived ───────────────────────────────────────────────────────────────
  const pinnedCount = state?.pinnedSlugs.length ?? 0
  const isFull = state != null && pinnedCount >= state.max
  const pinnedUsable = state?.catalog.filter((c) => c.pinned) ?? []
  const addable = state?.catalog.filter((c) => !c.pinned) ?? []
  /**
   * ช่องที่ "ยังใช้ได้" เหลือตัวเดียว = ถอดไม่ได้ (จะเหลือ 0 ช่องที่ใช้ได้)
   * แต่ช่องที่หมดสิทธิ์แล้วถอดได้เสมอ — ไม่ว่าจะเหลือกี่ช่อง (กฎเดียวกับ unpinShortcut ฝั่ง server)
   */
  const lockLastUsable = pinnedUsable.length <= 1

  return (
    // HR7: fixed inset-0 z-80 = full-screen viewport-lock (Paces ไม่มี token) — Base: SalesChartSheet.tsx
    <div className="fixed inset-0 z-80 flex flex-col bg-card" role="dialog" aria-label="แก้ไขเมนูลัด">
      <div className="flex shrink-0 items-center gap-3 border-b border-default-200 px-4 py-3">
        <button type="button" onClick={onClose} aria-label="ปิด" className="shrink-0 text-default-700">
          <Icon icon="chevron-left" className="size-6" />
        </button>
        <h3 className="flex-1 text-base font-semibold text-dark">แก้ไขเมนูลัด</h3>
        {state && (
          <span className={cn('shrink-0 text-sm tabular-nums', isFull ? 'text-warning-ink font-semibold' : 'text-default-700')}>
            {pinnedCount}/{state.max}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto w-full max-w-lg py-4">
          {loadFailed ? (
            <div className="py-10 text-center">
              <p className="text-sm text-default-700">โหลดเมนูลัดไม่สำเร็จ</p>
              <button type="button" onClick={() => void load()} className="btn btn-sm border-default-300 mt-3 min-h-11">
                ลองใหม่
              </button>
            </div>
          ) : !state ? (
            <ul className="grid gap-2">
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="h-14 animate-pulse rounded-lg bg-default-100" />
              ))}
            </ul>
          ) : (
            <>
              <h4 className="text-default-700 mb-2 text-xs font-semibold">ปักหมุดอยู่</h4>
              {pinnedCount === 0 ? (
                <p className="text-default-700 py-3 text-sm">ยังไม่ได้เลือกเมนูลัดไว้เลย เลือกจากด้านล่างได้เลย</p>
              ) : (
                <ul className="grid gap-1.5">
                  {/* icon มาจาก getShortcutTileIcon(slug) เดียวกับการ์ดจริงบนหน้าแรก — ถ้าใช้
                      item.icon (ชุด sidebar) ผู้ใช้จะเลือกไอคอนแบบหนึ่งแล้วได้อีกแบบบนหน้าแรก */}
                  {pinnedUsable.map((item) => (
                    <ShortcutRow
                      key={item.slug}
                      icon={getShortcutTileIcon(item.slug).icon}
                      iconTone={getShortcutTileIcon(item.slug).tone}
                      label={item.label}
                      tone="pinned"
                      actionIcon="x"
                      actionLabel={`เอา ${item.label} ออกจากเมนูลัด`}
                      busy={pending === item.slug}
                      disabled={lockLastUsable || (pending != null && pending !== item.slug)}
                      hint={lockLastUsable ? 'ต้องมีเมนูลัดอย่างน้อย 1 ช่อง' : undefined}
                      onClick={() => void togglePin(item.slug, 'unpin')}
                    />
                  ))}
                  {state.unavailable.map((item) => (
                    <ShortcutRow
                      key={item.slug}
                      icon="lock"
                      label={item.label}
                      tone="unavailable"
                      actionIcon="x"
                      actionLabel={`เอา ${item.label} ออกจากเมนูลัด`}
                      busy={pending === item.slug}
                      disabled={pending != null && pending !== item.slug}
                      badge="ใช้ไม่ได้แล้ว"
                      hint="สิทธิ์เข้าถึงเมนูนี้หมดแล้ว"
                      onClick={() => void togglePin(item.slug, 'unpin')}
                    />
                  ))}
                </ul>
              )}

              <h4 className="text-default-700 mt-6 mb-2 text-xs font-semibold">เลือกเพิ่ม</h4>
              {isFull && (
                <p className="text-default-700 mb-2 text-xs">
                  เลือกครบ {state.max} ช่องแล้ว เอาช่องเดิมออกก่อนถึงจะเพิ่มได้
                </p>
              )}
              {addable.length === 0 ? (
                <p className="text-default-700 py-3 text-sm">เลือกครบทุกเมนูที่คุณมีสิทธิ์ใช้แล้ว</p>
              ) : (
                <ul className="grid gap-1.5">
                  {addable.map((item) => (
                    <ShortcutRow
                      key={item.slug}
                      icon={getShortcutTileIcon(item.slug).icon}
                      iconTone={getShortcutTileIcon(item.slug).tone}
                      label={item.label}
                      tone="plain"
                      actionIcon="plus"
                      actionLabel={`เพิ่ม ${item.label} เข้าเมนูลัด`}
                      busy={pending === item.slug}
                      disabled={isFull || (pending != null && pending !== item.slug)}
                      onClick={() => void togglePin(item.slug, 'pin')}
                    />
                  ))}
                </ul>
              )}

              {/* รีเซ็ตเป็นทางออกที่ใช้ไม่บ่อย — ตั้งใจทำให้เล็ก ไม่แย่งความสนใจจากรายการด้านบน */}
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={() => void handleReset()}
                  disabled={resetting || pending != null}
                  className="text-default-700 inline-flex min-h-11 items-center gap-1.5 py-2 text-sm font-medium disabled:opacity-50"
                >
                  <Icon icon={resetting ? 'loader-2' : 'refresh'} className={cn('size-4', resetting && 'animate-spin')} />
                  รีเซ็ตเป็นค่าเริ่มต้น
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * ShortcutRow — Base: expenses/components/ExpenseCategoryFilterSheet.tsx `FilterRow`
 * ทั้งแถวคือปุ่มเดียว (tap target ≥44px จาก min-h-11) — ไม่ใช่ไอคอนเล็ก ๆ ท้ายแถว
 */
function ShortcutRow({
  icon,
  iconTone = 'text-primary',
  label,
  tone,
  actionIcon,
  actionLabel,
  badge,
  hint,
  busy,
  disabled,
  onClick,
}: {
  icon: string
  /** คลาสสีของไอคอน (token ธีม) — ไม่ส่งมา = น้ำเงินตามเดิม (ใช้กับแถวที่ไม่มีสีประจำช่อง เช่น lock) */
  iconTone?: string
  label: string
  tone: 'pinned' | 'unavailable' | 'plain'
  actionIcon: 'x' | 'plus'
  actionLabel: string
  badge?: string
  hint?: string
  busy: boolean
  disabled: boolean
  onClick: () => void
}) {
  const toneClass =
    tone === 'pinned'
      ? 'bg-primary/10 text-default-900'
      : tone === 'unavailable'
        ? 'bg-warning/10 text-default-700'
        : 'border border-default-200 text-default-900'

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || busy}
        aria-label={actionLabel}
        className={cn(
          'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start',
          toneClass,
          (disabled || busy) && 'opacity-50',
        )}
      >
        <Icon
          icon={icon}
          /* iconTone = สีประจำช่องนั้นบนการ์ดจริง ส่งมาจากผู้เรียก; ช่องที่สิทธิ์หมดบังคับเป็นเทา
             เสมอ เพราะสีประจำช่องจะขัดกับสารที่ต้องสื่อว่า "ใช้ไม่ได้แล้ว" */
          className={cn('shrink-0 text-xl', tone === 'unavailable' ? 'text-default-500' : iconTone)}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{label}</span>
            {badge && (
              <span className="badge bg-warning/15 text-warning-ink shrink-0 text-2xs">{badge}</span>
            )}
          </span>
          {hint && <span className="text-default-700 block text-2xs">{hint}</span>}
        </span>
        <Icon
          icon={busy ? 'loader-2' : actionIcon}
          className={cn(
            'size-5 shrink-0',
            busy && 'animate-spin',
            actionIcon === 'plus' ? 'text-primary' : 'text-default-700',
          )}
          aria-hidden="true"
        />
      </button>
    </li>
  )
}
