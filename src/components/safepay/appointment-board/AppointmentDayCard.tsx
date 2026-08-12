'use client'

/**
 * AppointmentDayCard — การ์ดนัดหนึ่งใบในชีตคิวงานรายวัน (ส่วนขยาย 2026-08-11)
 *
 * Base (โครงการ์ด + แถวปุ่มในการ์ด + เส้นประคั่น):
 *   theme/paces/Admin/TS/src/app/(admin)/apps/crm/activities/page.tsx
 * Base (รูป 40px + ตัวย่อสำรอง + badge ช่องทางมุมล่างขวา):
 *   src/app/(paces)/seller/(chat)/inbox/components/InboxList.tsx → BuyerAvatar
 *   + ChannelBadge.tsx → ChannelBadgeOverlay (import มาใช้ตรง ๆ ไม่ก็อป)
 * Base (ชีตปุ่มล่างจอ): src/app/(paces)/seller/(dashboard)/orders/components/OrderQrSheet.tsx
 *
 * ทำไมไม่ใช้ AppointmentDayRows: แถวนั้นถูกใช้ในชีตเลือกวันของฟอร์มสร้างออเดอร์ด้วย ซึ่ง
 * **ห้ามมีปุ่มที่พาออกจากหน้า** (ผู้ใช้กำลังกรอกร่างค้างอยู่ — เหตุผลเต็มอยู่ที่ prop onRowClick
 * ของไฟล์นั้น) และไม่มีเบอร์/รูปให้แสดงเพราะยิงคนละ endpoint. สองจอนี้จึงต่างกันที่ *ข้อมูลที่มี*
 * ไม่ใช่แค่ที่การจัดวาง — การยัดให้เป็น component เดียวจะได้ prop สวิตช์ 5 ตัวที่อ่านไม่ออก
 *
 * 🛑 การ์ดทั้งใบ **ไม่ใช่** ปุ่มเดียว — บล็อกบนสุด (รูป/ชื่อ/สถานะ) เป็นปุ่มเปิดออเดอร์ ส่วนแถวเบอร์
 * กับแถว action อยู่นอกปุ่มนั้น. ถ้าทำทั้งใบให้กดได้แล้ววางปุ่มซ้อนข้างใน จะต้องไล่ stopPropagation
 * ทุกปุ่มและพลาดง่ายมาก (บทเรียนเดียวกับ stretched-link ทับปุ่มท้ายการ์ดใน /products)
 */

import { useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { ChannelBadgeOverlay } from '@/app/(paces)/seller/(chat)/inbox/components/ChannelBadge'
import { generateInitials } from '@/utils/helpers'
import { normalizePhone } from '@/lib/phone'
import { formatBaht } from '@/lib/format-money'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { formatDateTH, formatDateTimeTH } from '@/lib/format-date'
import { isAllDayAppointment, APPOINTMENT_STATUS_LABEL, type AppointmentStatus } from '@/lib/appointments'
import { APPOINTMENT_STAGE_META } from '@/lib/appointment-stage'
import { appointmentCardAction, isClosedAppointment } from '@/lib/appointment-day-view'
import {
  appointmentOutcomeErrorMessage,
  appointmentOutcomeSuccessMessage,
  type AppointmentOutcome,
} from '@/lib/appointment-outcome'
import { getChannelLabel } from '@/lib/chat-channel'
// คำ + ไอคอนของ "ช่องทางการขาย" — SSOT เดียวกับที่คอลัมน์ "ที่มา" ของ /orders ใช้ (HR16)
import {
  SALES_CHANNEL_ICONS,
  SALES_CHANNEL_LABELS,
} from '@/app/(paces)/seller/(dashboard)/orders/components/data'
import type { AppointmentDayApiItem } from './types'

type Props = {
  item: AppointmentDayApiItem
  /** เติมชื่อคิวงานในแถวรอง — เปิดเมื่อรายการรวมหลายคิว (กติกาเดียวกับ AppointmentDayRows) */
  showResourceName?: boolean
  /** เวลาปัจจุบันที่ผู้เรียกถือไว้ตัวเดียว — ห้ามให้การ์ดแต่ละใบเรียก new Date() เอง (ดู AppointmentDayList) */
  now: Date
  /** ปิดผลสำเร็จแล้ว → ผู้เรียกโหลดรายการใหม่ */
  onChanged: () => void
}

/** รูปโปรไฟล์ลูกค้า + badge ช่องทาง — ตัวย่อคือของหลัก ไม่ใช่ของสำรอง (Messenger คืน null ทุกคน) */
function CustomerAvatar({
  avatarUrl,
  name,
  channel,
  pageAvatarUrl,
  fallbackIcon,
  fallbackLabel,
}: {
  avatarUrl: string | null
  name: string
  channel: string | null
  pageAvatarUrl: string | null
  /** ไอคอนของช่องทางการขายที่ร้านเลือก — ใช้เมื่อใบนี้ไม่ได้มาจากเธรดแชท */
  fallbackIcon: string
  fallbackLabel: string
}) {
  const [failed, setFailed] = useState(false)
  // ค่าที่ขึ้นต้นด้วย http = URL ดิบ (หมดอายุได้) · ที่เหลือคือ fileId ใน storage — กติกาเดียวกับกล่องแชท
  const src = avatarUrl ? (avatarUrl.startsWith('http') ? avatarUrl : `/api/files/${avatarUrl}`) : null

  return (
    <span className="relative shrink-0">
      {!src || failed ? (
        <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-full text-sm font-semibold">
          {generateInitials(name) || '?'}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="bg-default-100 size-10 rounded-full object-cover"
        />
      )}
      {/* ไม่มีเธรด = ใช้ไอคอนของช่องทางการขายที่ร้านเลือกเอง ไม่ใช่ปล่อยว่าง
          ช่องว่างอ่านเป็น "ยังโหลดไม่เสร็จ" ส่วนไอคอนอ่านเป็นข้อเท็จจริง
          🛑 `title` อย่างเดียวไม่พอ — มือถือไม่มี hover ผู้ใช้จึงไม่มีทางเห็นคำอธิบายเลย
          ต้องมี `role="img"` + `aria-label` คู่กัน (aria-name-requires-supporting-role.md) */}
      {channel ? (
        <ChannelBadgeOverlay channel={channel} imageUrl={pageAvatarUrl} />
      ) : (
        <span
          role="img"
          aria-label={`ช่องทาง ${fallbackLabel}`}
          title={fallbackLabel}
          className="ring-card bg-default-100 text-default-500 absolute -end-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full ring-2"
        >
          <Icon icon={fallbackIcon} className="text-2xs" aria-hidden="true" />
        </span>
      )}
    </span>
  )
}

/**
 * เมนู `⋯` — เป็น **ชีตล่างจอ ไม่ใช่ดรอปดาวน์**
 *
 * 🛑 ดรอปดาวน์ absolute จะถูก overflow ของกล่อง scroll ที่ครอบรายการตัดทิ้งเสมอ และการ์ดใบล่างสุด
 * คือใบที่โดนเต็ม ๆ (docs/conventions/scroll-container-clips-popovers.md) · ชีต fixed ไม่มีปัญหานั้น
 * และเป็นท่าที่ผู้ขายคุ้นอยู่แล้วบนมือถือ
 */
function CardActionSheet({
  who,
  orderToken,
  onNoShow,
  onClose,
}: {
  who: string
  orderToken: string
  onNoShow: () => void
  onClose: () => void
}) {
  useLockBodyScroll(true)
  return (
    // z-90 = เหนือชีตวัน (z-80) ซึ่งเป็นตัวที่ครอบการ์ดนี้อยู่
    // carve-out HR7: Paces ไม่มี token ชั้น overlay — precedent OrderQrSheet ใช้ z-80 มาก่อน
    <div className="fixed inset-0 z-90 flex items-end" role="dialog" aria-modal="true" aria-label={`ตัวเลือกของนัด ${who}`}>
      <button
        type="button"
        aria-label="ปิด"
        onClick={onClose}
        className="bg-default-900/40 absolute inset-0"
      />
      <div className="bg-card relative w-full rounded-t-2xl p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {/* carve-out HR7: safe-area ไม่มี token ในธีม */}
        <p className="text-default-500 mb-2 px-2 text-xs">{who}</p>
        <Link
          href={`/orders/${orderToken}`}
          className="btn text-default-800 hover:bg-default-100 min-h-11 w-full justify-start gap-2.5 rounded-lg px-3"
        >
          <Icon icon="calendar-repeat" className="size-4" aria-hidden="true" />
          เลื่อนนัด
        </Link>
        <button
          type="button"
          onClick={onNoShow}
          className="btn text-danger-ink hover:bg-danger/10 min-h-11 w-full justify-start gap-2.5 rounded-lg px-3"
        >
          <Icon icon="clock-off" className="size-4" aria-hidden="true" />
          ไม่มาตามนัด
        </button>
        <button
          type="button"
          onClick={onClose}
          className="btn bg-default-100 text-default-800 hover:bg-default-200 mt-2 min-h-11 w-full rounded-lg"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  )
}

export default function AppointmentDayCard({ item, showResourceName = false, now, onChanged }: Props) {
  const [busy, setBusy] = useState<AppointmentOutcome | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const start = new Date(item.start)
  const end = new Date(item.end)
  const allDay = isAllDayAppointment(start, end)
  const status = (item.appointmentStatus ?? 'SCHEDULED') as AppointmentStatus
  const meta = APPOINTMENT_STAGE_META[status] ?? APPOINTMENT_STAGE_META.SCHEDULED
  const statusLabel = APPOINTMENT_STATUS_LABEL[status] ?? APPOINTMENT_STATUS_LABEL.SCHEDULED
  const who = item.buyerName || 'ไม่ระบุชื่อ'
  const closed = isClosedAppointment(item.appointmentStatus)
  const action = appointmentCardAction({
    startISO: item.start,
    appointmentStatus: item.appointmentStatus,
    now,
  })

  /* Decimal มาเป็น string จาก API — แปลงครั้งเดียวตรงนี้ ไม่ใช่ในกลาง JSX
     ค่าที่ parse ไม่ได้ตกเป็น 0 = "ไม่แสดง" ซึ่งปลอดภัยกว่าโชว์ NaN */
  const totalNumber = Number(item.totalAmount) || 0
  const depositNumber = Number(item.depositAmount) || 0

  /** เบอร์ที่โทรออกได้จริง — ค่าที่ไม่ใช่รูปเบอร์ไทย (อีเมล/ข้อความอิสระ) ยังแสดงแต่ไม่มีปุ่มโทร */
  const dialable = item.buyerContact ? normalizePhone(item.buyerContact) : null

  /**
   * "ลูกค้ามาจากไหน" — ทุกคำมาจาก SSOT ห้ามพิมพ์เองที่นี่ (HR16)
   *
   * 🛑 ไม่มีคำที่ประดิษฐ์ขึ้นสำหรับเคส "ไม่มีเธรด" เลย (user เคาะ 2026-08-12) — ของเดิมเขียนว่า
   * "สร้างนอกแชท" ซึ่งผิด 3 ชั้น: นิยามด้วยสิ่งที่ *ไม่ได้* เกิดขึ้น · "สร้าง" เป็นกริยาของระบบ
   * ไม่ใช่คำที่ผู้ขายใช้เรียกที่มา · และไม่คู่ขนานกับ "Messenger · เพจ X" ที่เป็น **ชื่อที่มา**
   *
   * ทางที่ถูกคือไปอ่านฟิลด์ที่ถือคำตอบอยู่แล้ว: ร้านเลือก `salesChannel` เองตอนสร้าง
   * (ค่าตั้งต้นของฟอร์ม = `STOREFRONT` → "หน้าร้าน") จึงมีคำตอบจริงเกือบทุกใบ
   *
   * ลำดับ: เธรดจริง → หมวดที่ร้านเลือก → ไม่รู้
   * เธรดชนะเพราะเป็น *ข้อเท็จจริง* ที่พาย้อนกลับไปห้องแชทได้ ส่วน `salesChannel` ร้านแก้เองได้
   * ตลอด (สองค่านี้ไม่ตรงกันได้และไม่ถือว่าผิด — ดูคอมเมนต์ที่ `Order.shopChannelId` ในสคีมา)
   */
  const sourceText = item.source
    ? `${getChannelLabel(item.source.channel)} · ${item.source.pageName}`
    : item.salesChannel
      ? (SALES_CHANNEL_LABELS[item.salesChannel] ?? item.salesChannel)
      : // คำเดียวกับที่ /orders ใช้กับฟิลด์เดียวกัน (OrderSourceLogo) — ไม่ตั้งคำที่สอง
        'ไม่ระบุช่องทาง'

  const submit = async (outcome: AppointmentOutcome) => {
    const whenText = allDay ? formatDateTH(item.start) : formatDateTimeTH(item.start)
    const prefix = item.buyerName ? `${item.buyerName} ` : ''
    /* confirmSemantic ต้องตรงกับสีของปุ่มที่กดมา และคำต้องเหมือนหน้ารายละเอียดออเดอร์เป๊ะ
       (การกระทำเดียวกันสองจอ — ผู้ขายต้องอ่านแล้วรู้ว่าเป็นเรื่องเดียวกัน) */
    const ok =
      outcome === 'COMPLETED'
        ? await pacesConfirm({
            confirmSemantic: 'success',
            icon: 'warning',
            title: 'ทำเครื่องหมายว่าให้บริการแล้ว?',
            text: `ให้บริการ ${prefix}ตามนัด ${whenText} แล้ว · ย้อนกลับไม่ได้`,
            confirmButtonText: 'ให้บริการแล้ว',
            cancelButtonText: 'ยังไม่ใช่ตอนนี้',
          })
        : await pacesConfirm.danger(
            'บันทึกว่าลูกค้าไม่มาตามนัด?',
            `${prefix}ไม่มาตามนัด ${whenText} · ย้อนกลับไม่ได้`,
            { confirmButtonText: 'ไม่มาตามนัด', cancelButtonText: 'ยังไม่ใช่ตอนนี้' },
          )
    if (!ok) return

    setBusy(outcome)
    try {
      const res = await fetch(`/api/orders/${item.orderToken}/appointment/outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(appointmentOutcomeErrorMessage(data.error, whenText))
      }
      pacesToast.success(appointmentOutcomeSuccessMessage(outcome))
      onChanged()
    } catch (err: unknown) {
      pacesToast.error(err instanceof Error ? err.message : 'บันทึกผลนัดไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setBusy(null)
    }
  }

  return (
    /* ปิดผลแล้ว = พื้นจางลงเล็กน้อย — ห้ามใช้ opacity ทั้งใบ ป้ายสถานะจะตกคอนทราสต์ */
    <div className={`rounded-lg p-3 ${closed ? 'bg-default-50' : 'bg-card'}`}>
      {/* บล็อกบน = ปุ่มเปิดออเดอร์ · ชื่อสำหรับ AT ประกอบเองเพราะเนื้อในเป็นชิ้นส่วนหลายชิ้น */}
      <Link
        href={`/orders/${item.orderToken}`}
        aria-label={
          `เปิดรายละเอียดนัดของ ${who}` +
          (showResourceName && item.resource ? ` ประเภทงาน ${item.resource.name}` : '') +
          /* เดิมต่อว่า "จาก ${sourceText}" ซึ่งพังเมื่อค่าไม่ใช่ชื่อสถานที่ (อ่านได้ว่า
             "จาก สร้างนอกแชท") — ใช้คำนำหน้าที่เป็นกลางแทน ใช้ได้กับทุกค่าที่เป็นไปได้ */
          (item.firstItemName ? ` รายการ ${item.firstItemName}` : '') +
          (totalNumber > 0 ? ` ยอด ${formatBaht(totalNumber)}` : '') +
          (depositNumber > 0 ? ` มัดจำ ${formatBaht(depositNumber)}` : '') +
          ` สถานะ ${statusLabel} ช่องทาง ${sourceText}` +
          (item.orderNo ? ` เลขที่ ${item.orderNo}` : '')
        }
        className="focus-visible:ring-primary flex items-start gap-2.5 rounded-lg focus-visible:ring-2 focus-visible:outline-none"
      >
        <CustomerAvatar
          avatarUrl={item.customerAvatarUrl}
          name={who}
          channel={item.source?.channel ?? null}
          pageAvatarUrl={item.source?.pageAvatarUrl ?? null}
          fallbackIcon={
            item.salesChannel ? (SALES_CHANNEL_ICONS[item.salesChannel] ?? 'world') : 'world'
          }
          fallbackLabel={sourceText}
        />
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-base ${closed ? 'text-default-700 font-medium' : 'text-dark font-semibold'}`}
          >
            {who}
          </span>
          {/* บรรทัด "งานนี้คืออะไร" + เงิน — สิ่งเดียวที่ทำให้นัดสองใบในช่วงเวลาเดียวกันต่างกันจริง
              (ก่อนหน้านี้แยกได้แค่ด้วยชื่อคน) จึงอยู่ติดใต้ชื่อ ไม่ใช่ลงไปปนกับแถวสถานะ

              🛑 มัดจำเขียนได้แค่ยอด ห้ามพูดว่าจ่ายแล้ว/ค้างจ่าย — ระบบไม่ติดตามสถานะการจ่ายเลย
              (BR-RSV-50) · "0" = ไม่เก็บมัดจำ (BR-RSV-44) จึงไม่แสดงส่วนนั้น
              ยอดเงินผ่าน formatBaht ตัวเดียวทั้งระบบ ห้ามจัดรูปเองที่นี่ (HR16) */}
          {item.firstItemName || totalNumber > 0 ? (
            <span className="mt-0.5 flex items-baseline gap-x-2">
              <span className="text-default-800 min-w-0 flex-1 truncate text-sm">
                {item.firstItemName ?? 'ไม่ระบุรายการ'}
                {item.itemCount > 1 ? (
                  <span className="text-default-500"> +{item.itemCount - 1}</span>
                ) : null}
              </span>
              {totalNumber > 0 ? (
                <span className="text-default-800 shrink-0 text-sm font-semibold tabular-nums">
                  {formatBaht(totalNumber)}
                  {depositNumber > 0 ? (
                    <span className="text-default-500 ms-1 text-2xs font-normal">
                      มัดจำ {formatBaht(depositNumber)}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </span>
          ) : null}

          {/* flex-wrap: ที่ 320px ป้าย "ลูกค้ายืนยันแล้ว" + ชื่อเพจ ยาวเกินหนึ่งบรรทัดเป็นปกติ
              (flex ตัดสิน wrap จากขนาดเนื้อหาเต็มก่อนหด — flex-header-truncation.md)

              🛑 `truncate` เฉย ๆ ไม่พอในกล่อง flex — ต้องมี `min-w-0` ที่ตัวกล่องและ `max-w-full`
              ที่ลูกด้วย ไม่งั้นชื่อเพจยาว ๆ จะดันกล่องกว้างเกินจอแทนที่จะถูกตัด แล้วเนื้อหาทั้งชีต
              เลื่อนข้างได้จนการ์ดหลุดขอบซ้าย (เกิดจริงบน prod 2026-08-12 กับเพจชื่อ
              "BT Premium Auto Xenon คลอง4 ธัญบุรี") */}
          <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`badge ${meta.cls}`}>{statusLabel}</span>
            {showResourceName && item.resource ? (
              <span className="text-default-700 max-w-full truncate text-xs">{item.resource.name}</span>
            ) : null}
            <span className="text-default-500 max-w-full truncate text-2xs">{sourceText}</span>
          </span>
        </span>
        <Icon icon="chevron-right" className="text-default-400 mt-1 size-4 shrink-0" aria-hidden="true" />
      </Link>

      {/* แถวเบอร์ — เบอร์คือสิ่งที่ผู้ขายใช้ต่อกับลูกค้าทันที จึงได้บรรทัดของตัวเองและตัวใหญ่กว่าแถวรอง
          ไม่มีเบอร์ก็ต้องพูด ห้ามปล่อยแถวว่าง (partial-data-must-be-labeled-or-filled.md) */}
      <div className="border-default-200 mt-2.5 flex items-center gap-2 border-t border-dashed pt-2.5">
        {item.buyerContact ? (
          <span className="text-dark flex min-w-0 flex-1 items-center gap-1.5 text-base font-semibold tabular-nums">
            <Icon icon="phone" className="text-default-400 size-4 shrink-0" aria-hidden="true" />
            <span className="sr-only">เบอร์ติดต่อ </span>
            <span className="truncate">{item.buyerContact}</span>
          </span>
        ) : (
          <span className="text-default-400 min-w-0 flex-1 text-sm">ยังไม่มีเบอร์</span>
        )}
        <span className="flex shrink-0 items-center gap-1.5">
          {dialable ? (
            <a
              href={`tel:${dialable}`}
              aria-label={`โทรหา ${who}`}
              className={`btn min-h-11 gap-1.5 ${
                closed
                  ? 'border-default-300 text-default-700 hover:bg-default-50 border'
                  : 'bg-primary hover:bg-primary-hover text-white'
              }`}
            >
              <Icon icon="phone" className="size-4" aria-hidden="true" />
              โทร
            </a>
          ) : null}
          {/* ไม่มีเธรด = ไม่มีปลายทาง — ปุ่มที่กดแล้วไปไม่ถึงไหนแย่กว่าไม่มีปุ่ม */}
          {item.conversationId ? (
            <Link
              href={`/inbox/${item.conversationId}`}
              aria-label={`ทักแชทหา ${who}`}
              className="btn border-default-300 text-default-700 hover:bg-default-50 min-h-11 min-w-11 border"
            >
              <Icon icon="message-2" className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
        </span>
      </div>

      {/* แถวลงมือ — โผล่เฉพาะตอนกดได้จริง (BR-RSV-34) ไม่ใช่ปุ่มเทาเรียงกันทั้งลิสต์ */}
      {action !== 'none' ? (
        <div className="border-default-200 mt-2.5 flex items-center gap-2 border-t border-dashed pt-2.5">
          {action === 'reschedule' ? (
            /* ตัวเลือกเวลาใหม่อยู่ในหน้ารายละเอียดออเดอร์ (RescheduleAppointmentSheet ต้องการ
               resourceId + เหตุผลที่ลูกค้าฝากไว้ ซึ่ง payload ของจอนี้ไม่มีโดยตั้งใจ) — ปุ่มนี้
               จึงพาไปที่นั่น ไม่ใช่เปิดแผงครึ่ง ๆ กลาง ๆ ที่ข้อมูลไม่ครบ */
            <Link
              href={`/orders/${item.orderToken}`}
              className="btn bg-default-100 text-default-800 hover:bg-default-200 min-h-11 flex-1 gap-1.5"
            >
              <Icon icon="calendar-repeat" className="size-4" aria-hidden="true" />
              เลือกเวลาใหม่ให้ลูกค้า
            </Link>
          ) : (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => submit('COMPLETED')}
              className="btn border-success text-success-ink hover:bg-success/10 min-h-11 flex-1 gap-1.5 border"
            >
              <Icon
                icon={busy === 'COMPLETED' ? 'loader-2' : 'circle-check-filled'}
                className={`size-4 ${busy === 'COMPLETED' ? 'animate-spin motion-reduce:animate-none' : ''}`}
                aria-hidden="true"
              />
              ให้บริการแล้ว
            </button>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label={`ตัวเลือกอื่นของนัด ${who}`}
            className="btn border-default-300 text-default-700 hover:bg-default-50 min-h-11 min-w-11 border"
          >
            <Icon icon="dots" className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {menuOpen ? (
        <CardActionSheet
          who={who}
          orderToken={item.orderToken}
          onClose={() => setMenuOpen(false)}
          onNoShow={() => {
            setMenuOpen(false)
            void submit('NO_SHOW')
          }}
        />
      ) : null}
    </div>
  )
}
