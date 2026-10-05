'use client'

/**
 * GroupDetailClient — หน้าตั้งค่ากลุ่ม LINE (ผูกแล้ว / บอทถูกนำออก): แบนเนอร์ + ตั้งค่า autosave + การ์ดข้อความ + คำสั่ง + ประวัติ · feature 00070 · E3
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/pages/pricing/page.tsx (page shell ที่ [groupId]/page.tsx) · ui/cards/page.tsx (.card ทุกใบ)
 *   · form/elements/components/ChecksRadioSwitches.tsx + InputTextfieldType.tsx (ฟอร์ม) · plugins/sweet-alerts/components/SweetAlerts.tsx (confirm)
 *   · docs/conventions/seller-action-placement.md (action-bar) · ลำดับ/โครง `lg:grid-cols-5` ตาม base spec ส่วน D
 *
 * boolean/ป้าย/แบนเนอร์/เหตุปุ่มทดสอบ ทั้งหมดมาจาก presenter (toPresenterGroup → groupBadge/bannerFor/canEdit/canTest/testBlockedReason/testsLeft) — ห้ามคำนวณเอง
 * layout: มือถือ = ร้าน → เวลา → การ์ดข้อความ → คำสั่ง → ประวัติ (ผ่าน `order-*` + wrapper `contents`) · lg = ซ้าย 3 (ร้าน เวลา ประวัติ) : ขวา 2 (การ์ดข้อความ sticky, คำสั่ง)
 * state ก้อนเดียว = ผลของ `useAutosave` · ห้ามมี hook ใต้ early return (view สลับด้วย JSX ท้ายฟังก์ชัน ไม่ return ก่อน hook)
 */
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import type { AppShell } from '@/lib/app-shell'
import { formatDateTH } from '@/lib/format-date'
import { orderWordFor } from '@/lib/line-report/order-word'
import { PENDING_GROUP_FALLBACK_NAME } from '@/lib/line-report/list-view'
import { SAVE_STATUS_TEXT } from '@/lib/line-report/autosave'
import { bannerFor, canEdit, canTest, groupBadge, testBlockedReason, testsLeft, toPresenterGroup } from '@/lib/line-report/presenter'
import { pacesToast } from '@/lib/paces-toast'
import { buildShopRows } from '@/lib/line-report/settings-guards'
import type { GroupDetailDto } from '@/services/line-report-group.service'
import BindWizard from '../_components/BindWizard'
import CommandsCard from '../_components/detail/CommandsCard'
import DetailActionBar from '../_components/detail/DetailActionBar'
import GroupBanner from '../_components/detail/GroupBanner'
import HistoryCard from '../_components/detail/HistoryCard'
import MessageCard from '../_components/detail/MessageCard'
import ScheduleCard from '../_components/detail/ScheduleCard'
import StatCards from '../_components/detail/StatCards'
import ShopsCard from '../_components/detail/ShopsCard'
import { useAutosave } from '../_components/detail/useAutosave'

export type GroupDetailClientProps = {
  initialGroup: GroupDetailDto
  /** `listReportableShops(ownerId)` — ร้านที่เพิ่มเข้ากลุ่มได้ (รวมกับร้านเดิมของกลุ่มที่อาจล็อกแล้ว) */
  reportableShops: { id: string; name: string; vertical: string | null; kind: string }[]
  shell: AppShell
  lockReason: 'NEVER' | 'RENEWAL_FAILED'
  /** เวลา server ตอนเรนเดอร์ — ใช้เป็น "ข้อมูล ณ" ของพรีวิว (ห้าม new Date() ฝั่ง client: hydration mismatch) */
  serverNowIso: string
  initialView?: 'settings' | 'rebind'
  /** props ของ BindWizard โหมด rebind (INACTIVE) */
  rebind: { addFriendUrl: string | null; blockedReason: string | null }
}

export default function GroupDetailClient({ initialGroup, reportableShops, shell, lockReason, serverNowIso, initialView = 'settings', rebind }: GroupDetailClientProps) {
  const router = useRouter()
  const [view, setView] = useState<'settings' | 'rebind'>(initialView)
  const [sending, setSending] = useState(false)
  const { group, shopIds, status, update, updateShops, refetch } = useAutosave(initialGroup)

  // ack ครั้งเดียวตอน mount — การเปิดดูคือการรับทราบ (fire-and-forget · alertKind ใน DB คงอยู่จนเหตุถูกแก้)
  const needsAck = useRef(initialGroup.alert !== null && !initialGroup.alert.acked)
  useEffect(() => {
    if (!needsAck.current) return
    needsAck.current = false
    void fetch(`/api/line-report/groups/${initialGroup.id}/ack`, { method: 'POST', credentials: 'same-origin', cache: 'no-store' }).catch(() => {})
  }, [initialGroup.id])

  const pg = toPresenterGroup(group)
  const badge = groupBadge(pg, group.paused)
  const banner = bannerFor(pg, group.paused, shell, lockReason)
  const editable = canEdit(pg, group.paused)
  const testOk = canTest(pg, group.paused, group.test.usedToday)
  const blocked = testBlockedReason(pg, group.paused, group.test.usedToday)
  const { word } = orderWordFor(group.shops)
  const rows = buildShopRows(group.shops, reportableShops)
  const name = group.groupName || PENDING_GROUP_FALLBACK_NAME

  async function sendTest() {
    if (sending || !testOk) return
    setSending(true)
    try {
      const res = await fetch(`/api/line-report/groups/${group.id}/test`, { method: 'POST', credentials: 'same-origin', cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) pacesToast.success('ส่งตัวอย่างเข้ากลุ่มแล้ว ดูได้ในกลุ่ม LINE')
      else pacesToast.error(data.message ?? 'ส่งไม่สำเร็จ ลองอีกครั้ง')
      // ส่งล้มก็นับโควตา (API §4.4) → ดึงใหม่ทุกครั้งที่ server ตอบ · บอทหลุด/แพ็กเกจหมด = สถานะหน้าเปลี่ยน → ให้ RSC เรนเดอร์ใหม่
      if (res.ok || res.status < 500) await refetch()
      if (data.error === 'BOT_NOT_IN_GROUP' || data.error === 'PACKAGE_REQUIRED') router.refresh()
    } catch {
      pacesToast.error('เชื่อมต่อไม่ได้ ลองอีกครั้ง')
    } finally {
      setSending(false)
    }
  }

  if (view === 'rebind') {
    return (
      <>
        <button
          type="button"
          onClick={() => setView('settings')}
          className="btn border-default-300 text-default-700 hover:bg-default-100 mb-base inline-flex items-center gap-1.5 border"
        >
          <Icon icon="chevron-left" className="text-base" aria-hidden="true" />
          กลับไปตั้งค่า
        </button>
        <BindWizard
          mode="rebind"
          groupId={group.id}
          shopNames={group.shops.map((s) => s.name)}
          liveCodeExpiresAt={group.bind.hasLiveCode ? group.bind.expiresAt : null}
          addFriendUrl={rebind.addFriendUrl}
          blockedReason={rebind.blockedReason}
        />
      </>
    )
  }

  return (
    <>
      <DetailActionBar
        badge={badge}
        groupId={group.id}
        groupName={name}
        canTest={testOk}
        blockedReason={blocked}
        testsLeft={testsLeft(group.test.usedToday)}
        sending={sending}
        busy={sending || status === 'saving'}
        onTest={sendTest}
      />
      {banner && <GroupBanner banner={banner} onRebind={() => setView('rebind')} />}

      <div className="mb-base flex items-start gap-3">
        <span className="bg-light text-default-700 flex size-10 shrink-0 items-center justify-center rounded-lg">
          <Icon icon="brand-line" className="text-xl" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h4 className="text-default-900 mb-0 text-md font-semibold break-words">{name}</h4>
          <p className="text-default-700 mb-0 text-xs">
            {group.boundAt ? `ผูกเมื่อ ${formatDateTH(group.boundAt)} · ` : ''}
            <span aria-live="polite">{SAVE_STATUS_TEXT[status]}</span>
          </p>
        </div>
      </div>

      <StatCards group={group} />
      {/* ข้อความที่ส่งเข้ากลุ่มเต็มกว้างใต้การ์ดตัวเลข (ตาม mockup) — ตัวอย่างแสดงเต็ม */}
      <div className="mb-base">
        <MessageCard group={group} canEdit={editable} serverNowIso={serverNowIso} />
      </div>

      <div className="mb-base flex flex-col gap-4 lg:grid lg:grid-cols-5 lg:items-start">
        <div className="contents lg:col-span-3 lg:flex lg:flex-col lg:gap-4">
          <ShopsCard rows={rows} selected={shopIds} canEdit={editable} onChange={updateShops} />
          <ScheduleCard settings={group.settings} cycle={group.cycle} canEdit={editable} orderWord={word} onChange={update} />
          <HistoryCard deliveries={group.deliveries} />
        </div>
        <div className="contents lg:col-span-2 lg:flex lg:flex-col lg:gap-4">
          <CommandsCard />
        </div>
      </div>
    </>
  )
}
