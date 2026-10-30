'use client'

/**
 * AssigneePicker — "ผู้รับผิดชอบ" ในฟอร์มสร้างงานของร้านบริการ (feature 00086 P3-T8 · S-6 · prototype v13 `screenCreate`)
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx (Rounded Buttons — `btn ... rounded-full`)
 * Sibling: expenses/components/ExpenseFormModal.tsx (ชิปวันที่ — คลาสชุดเดียวกัน: btn-sm min-h-11 rounded-full + aria-pressed)
 *   หัวส่วน: มือถือแบบ section "ลูกค้ามาแบบไหน" ของ QuickForm · เดสก์ท็อปแบบหัวบล็อกนัดของ CartPanel
 *
 * ผูก field `assignedUserId` ของ FormValues ผ่าน control ตัวเดียวกับ submit (RHF shared — มือถือ/เดสก์ท็อปเห็นค่าเดียวกัน)
 * แสดง/ไม่แสดงเป็นหน้าที่ของ caller (SSOT: showsAssigneePicker ใน lib/order-form-assignee)
 * ชื่อคนเปล่า ๆ ไม่เติม "ช่าง" นำหน้า (OOS-3)
 *
 * มติ 2026-10-30 (ร้านช่างเยอะ · prototype v14) — ช่างเกิน ASSIGNEE_CHIPS_MAX คน: ชิปยาวหลายแถว
 * ⇒ ช่องเดียว (ชื่อที่เลือก + ป้ายว่าง/ติดงาน · v16) แตะแล้วเปิด AssigneeSheet โหมดเลือก (ค้นชื่อ · ว่าง/ติดงานตามช่วงเวลาของฟอร์ม)
 * ไม่เกิน = ชิปแบบเดิมทุกตัวอักษร
 */

import { useEffect, useState } from 'react'
import { useController } from 'react-hook-form'
import type { Control } from 'react-hook-form'
import Icon from '@/components/wrappers/Icon'
import AssigneeSheet from '@/components/safepay/service-job/AssigneeSheet'
import StaffLoadLine from '@/components/safepay/service-job/StaffLoadLine'
import { staffQuery, usesAssigneeSearch, type LoadWindow, type StaffLoad } from '@/lib/assignee-load'
import { isSameBangkokDay } from '@/lib/format-date'
import { parseServiceStaff } from '@/lib/order-form-assignee'
import type { ServiceStaffOption } from '@/lib/order-form-assignee'
import type { FormValues } from './OrderCreateForm'

interface Props {
  control: Control<FormValues>
  staff: readonly ServiceStaffOption[]
  /** 'section' = มือถือ (QuickForm) · 'panel' = เดสก์ท็อป (CartPanel) */
  variant: 'section' | 'panel'
  /** คลาส padding แนวนอนของ section มือถือ (ตาม compact ของ QuickForm) */
  secX?: string
  /** ร้านของฟอร์ม — ชีตเลือกโหลดรายชื่อของร้านนี้ (กล่องแชทรวมหลายร้าน) */
  shopId: string
  /** ช่วงเวลาของงานที่กรอกอยู่ (assigneeFormWindow) — null = ชีตแสดงชื่ออย่างเดียว */
  loadWindow: LoadWindow | null
  /** ยังไม่มีช่วงเวลา (จองที่ยังไม่เลือกวัน/เวลา) — บรรทัดบอกในชีต (assigneeWindowHint) */
  loadWindowHint?: string | null
}

// critique P1-6 — ไม่ใช้คำ "พนักงาน" (lexicon lock lib/no-permission-copy.ts)
const HINT = 'ไม่บังคับ — ถ้าไม่เลือก ฝ่ายช่างกด "รับงานนี้" เองได้'

export default function AssigneePicker({ control, staff, variant, secX = 'px-4 md:px-8', shopId, loadWindow, loadWindowHint = null }: Props) {
  const { field } = useController({ control, name: 'assignedUserId', defaultValue: null })
  const current = field.value ?? null
  const [sheetOpen, setSheetOpen] = useState(false)
  // คนที่เลือกไม่อยู่ในรายชื่อแล้ว (โหลดใหม่หลังถูกถอดช่าง) = แสดงเป็น "ยังไม่มีคนรับ"
  const picked = staff.find((s) => s.userId === current) ?? null

  // ช่องที่เลือก (โหมดช่างเยอะ) แสดงป้ายว่าง/ติดงานของคนที่เลือก ตามช่วงเวลาที่กรอกอยู่ (prototype v16)
  // deps เป็นสตริง — window ถูกสร้างใหม่ทุก render · ไม่มีช่วง/ไม่ได้เลือก/โหลดล้ม = ไม่มีป้าย (ชื่ออย่างเดียว)
  const searchMode = usesAssigneeSearch(staff.length)
  const pickedId = searchMode ? (picked?.userId ?? null) : null
  const fromISO = loadWindow?.from.toISOString() ?? null
  const toISO = loadWindow?.to.toISOString() ?? null
  const [pickedLoad, setPickedLoad] = useState<{ key: string; load: StaffLoad } | null>(null)
  const loadKey = `${pickedId}|${fromISO}|${toISO}`
  useEffect(() => {
    if (!pickedId || !fromISO || !toISO) return
    let cancelled = false
    const win = { from: new Date(fromISO), to: new Date(toISO) }
    fetch(`/api/shops/current/service-staff${staffQuery({ shopId, window: win })}`, { cache: 'no-store' })
      .then(async (r) => (r.ok ? parseServiceStaff(await r.json()) : null))
      .then((list) => {
        const load = list?.find((s) => s.userId === pickedId)?.load
        if (!cancelled && load) setPickedLoad({ key: `${pickedId}|${fromISO}|${toISO}`, load })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [pickedId, fromISO, toISO, shopId])
  // ค่าที่ค้างจากคน/ช่วงก่อนหน้าไม่แสดง
  const shownLoad = pickedLoad?.key === loadKey ? pickedLoad.load : null

  const chip = (key: string, value: string | null, label: string) => {
    const active = current === value
    return (
      <button
        key={key}
        type="button"
        aria-pressed={active}
        onClick={() => field.onChange(value)}
        className={`btn btn-sm min-h-11 max-w-full rounded-full ${
          active ? 'bg-primary/15 text-primary-ink font-semibold' : 'bg-light text-dark'
        }`}
      >
        <span className="truncate">{label}</span>
      </button>
    )
  }

  const searchField = (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setSheetOpen(true)}
        className="border-default-300 hover:border-default-500 flex min-h-13 w-full items-center gap-3 rounded-lg border bg-card px-3 py-2 text-start"
      >
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
            picked ? 'bg-primary/15 text-primary-ink' : 'bg-default-100 text-default-500'
          }`}
          aria-hidden="true"
        >
          {picked ? Array.from(picked.displayName.replace(/^[เแโใไ]/, ''))[0] : <Icon icon="users" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-dark block truncate text-sm font-semibold">{picked ? picked.displayName : 'ยังไม่มีคนรับ'}</span>
          {picked && shownLoad ? (
            <StaffLoadLine load={shownLoad} sameDay={isSameBangkokDay(fromISO!)} />
          ) : (
            <span className="text-default-700 block text-xs">
              {picked ? 'แตะเพื่อเปลี่ยน' : `แตะเพื่อเลือกจาก ${staff.length} คน · ค้นชื่อได้`}
            </span>
          )}
        </span>
        <Icon icon="chevron-right" className="text-default-400 shrink-0" aria-hidden="true" />
      </button>
      <AssigneeSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        shopId={shopId}
        currentUserId={picked?.userId ?? null}
        window={loadWindow}
        windowHint={loadWindowHint}
        onSelect={(userId) => field.onChange(userId)}
      />
    </>
  )

  const chips = searchMode ? searchField : (
    <div role="group" aria-label="ผู้รับผิดชอบ" className="flex flex-wrap gap-2">
      {/* critique P1-5 — คำเดียวกับการ์ด "งานนี้"/ชีตมอบงาน ("ยังไม่มีคนรับ") · คำใบ้ข้างบนบอกว่าช่างกดรับเองได้ */}
      {chip('none', null, 'ยังไม่มีคนรับ')}
      {staff.map((s) => chip(s.userId, s.userId, s.displayName))}
    </div>
  )

  if (variant === 'panel') {
    return (
      <div className="border-t border-default-200">
        <div className="flex items-center gap-2 px-4 py-3">
          <Icon icon="user-cog" className="size-4 text-default-400" />
          <h5 className="text-sm font-semibold text-dark">ผู้รับผิดชอบ</h5>
          <span className="text-xs text-default-500">ไม่บังคับ</span>
        </div>
        <div className="px-4 pb-4">{chips}</div>
      </div>
    )
  }

  return (
    <section className={`border-b-8 border-default-100 ${secX} py-4`}>
      <h2 className="mb-1 text-base font-bold text-dark">ผู้รับผิดชอบ</h2>
      <p className="mb-3 text-xs text-default-700">{HINT}</p>
      {chips}
    </section>
  )
}
