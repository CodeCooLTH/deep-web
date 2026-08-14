'use client'

/**
 * InboxFilterPanel — ปุ่ม "ตัวกรอง" + popover รวมตัวกรองของรายการแชท
 *
 * Base (trigger + popover state/click-outside): PageFilterDropdown.tsx + OrderCardMenu.tsx
 *   (custom React dropdown — ไม่ใช้ Preline hs-dropdown เพราะ list re-render บ่อยทำให้ inline-state พัง)
 * Base (chip): `badge`/`btn` ของ Paces — Paces primitive เท่านั้น (HR7)
 *
 * ── ออกแบบใหม่ 2026-07-31 ตาม mockup ที่ user อนุมัติ ────────────────────────
 * docs/superpowers/specs/2026-07-31-inbox-filter-header-v2-mockup.html (V1)
 *
 * 1. ตัวเลือกเป็น **ชิปพับได้** ไม่ใช่รายการแนวตั้งยาว — เห็นครบในจอเดียว
 * 2. **มีร่างก่อนกดใช้** — เลือกชิปแล้วยังไม่มีผลจนกด "ใช้ตัวกรอง" ต่างจากเดิมที่เปลี่ยนแล้วยิง
 *    query ทันทีทุกครั้ง (อยากปรับ 3 อย่างต้องรอโหลด 3 รอบ และไม่มีจุดจบให้รู้ว่าเสร็จ)
 * 3. **สถานะ (ปิดงาน) กับ สแปม ไม่อยู่ในนี้แล้ว** — ขึ้นไปเป็นแท็บในแถวล่างของส่วนหัว
 *    ถ้าปล่อยไว้ทั้งสองที่จะคุมเรื่องเดียวกันจาก 2 จุดแล้วขัดกันเอง
 * 4. หัวข้อที่ไม่มีความหมายกับร้านนั้นจะไม่แสดง: "ช่องทาง" (ร้านเชื่อมช่องทางเดียว — เดิมชื่อ "เพจ"
 *    ก่อนแก้ 2026-08-09 feature 00025 S-14a เพื่อครอบ LINE OA ด้วย), "พัสดุ" (ไม่ได้เชื่อม iShip)
 */
import Icon from '@/components/wrappers/Icon'
import { Fragment, useEffect, useRef, useState } from 'react'
import { ChannelBadgeOverlay, type ChannelFilterOption } from './ChannelBadge'
import { PageAvatar } from './PageFilterDropdown'

// type/ค่าเริ่มต้นย้ายไป chat-list-query.ts (plain TS) แล้ว — อยู่ที่เดียวกับตัวประกอบ query
// ที่ผู้เรียกทุกจุดต้องใช้ร่วมกัน ไม่งั้น "ชุดแรกไม่ตรงกับแท็บที่ไฮไลต์" ซ้ำรอยเดิมได้อีก
// re-export ไว้เพื่อไม่ต้องแก้ import site เดิมทั้งหมด
export { DEFAULT_CHAT_FILTER } from './chat-list-query'
export type { ChatFilterState, ShipmentFilterValue } from './chat-list-query'
import type { ChatFilterState, ShipmentFilterValue } from './chat-list-query'
import { DEFAULT_CHAT_FILTER } from './chat-list-query'
import { useT } from '@/i18n/LocaleProvider'
import type { Dictionary } from '@/i18n/dictionaries/th'

/**
 * จำนวนตัวกรองที่ "ไม่ใช่ค่าเริ่มต้น" — โชว์เป็น badge บนปุ่ม
 * ไม่นับ status/spam เพราะแท็บในส่วนหัวแสดงอยู่แล้ว (นับซ้ำ = ปุ่มขึ้นเลขทั้งที่ผู้ใช้ไม่ได้แตะแผงนี้)
 * นับ tags เป็น 1 ไม่ว่าเลือกกี่อัน — badge บอก "มีกี่เรื่องที่กรองอยู่" ไม่ใช่จำนวนค่า
 */
export function countActiveFilters(f: ChatFilterState, pageFilter = ''): number {
  let n = 0
  if (f.customerLinked !== DEFAULT_CHAT_FILTER.customerLinked) n++
  if (f.hidden !== DEFAULT_CHAT_FILTER.hidden) n++
  if (f.readState !== DEFAULT_CHAT_FILTER.readState) n++
  if (f.tags.length > 0) n++
  if (f.shipment !== DEFAULT_CHAT_FILTER.shipment) n++
  if (pageFilter) n++
  return n
}

/**
 * 🛑 เคยเป็นค่าคงที่ระดับ module ⇒ ผูกกับภาษาที่โหลดตอน bundle แล้วค้างเป็นไทยตลอดไป
 * (กับดักเดิมของ feature 00047 — เจอมาแล้วที่ Yup schema / CALLBACK_STATUS_MESSAGE / TABS)
 * ตอนนี้เป็นฟังก์ชันรับ dictionary เรียกในตัว component ที่มี `useT()` อยู่แล้ว
 */
function readOptions(t: Dictionary): { value: ChatFilterState['readState']; label: string }[] {
  return [
    { value: 'all', label: t.inbox.channelAll },
    { value: 'unread', label: t.inbox.filterPanel.unread },
    { value: 'read', label: t.inbox.filterPanel.read },
  ]
}
function linkedOptions(t: Dictionary): { value: ChatFilterState['customerLinked']; label: string }[] {
  return [
    { value: 'all', label: t.inbox.channelAll },
    { value: 'linked', label: t.inbox.filterPanel.linked },
    { value: 'unlinked', label: t.inbox.filterPanel.unlinked },
  ]
}
function shipmentOptions(t: Dictionary): { value: ShipmentFilterValue; label: string }[] {
  return [
    { value: 'all', label: t.inbox.channelAll },
    { value: 'none', label: t.inbox.filterPanel.shipmentNone },
    { value: 'unprinted', label: t.inbox.filterPanel.shipmentUnprinted },
    { value: 'printed', label: t.inbox.filterPanel.shipmentPrinted },
    // อยู่ในดรอปดาวน์ด้วยเพื่อให้ล้าง/สลับได้จากที่เดียวกับตัวอื่น — ส่วนชิปแดงในแถบตัวกรอง
    // มีไว้เพราะตัวเลขของมันมีความหมายแม้ยังไม่ได้กรอง (บอกว่ามีกี่เคสรอจัดการ)
    { value: 'problem', label: t.inbox.filterPanel.shipmentProblem },
  ]
}

function Chip({
  on,
  label,
  onClick,
  leading,
}: {
  on: boolean
  label: string
  onClick: () => void
  /** ภาพนำหน้าข้อความ — ใช้กับชิปเพจ (รูปเพจ + โลโก้ช่องทาง) */
  leading?: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      // ชิปที่มีรูปนำหน้าต้องเว้นซ้ายน้อยลง ไม่งั้นรูปลอยห่างขอบ — เขียนเป็น ps เดียวแบบมีเงื่อนไข
      // (ใส่ ps-1.5 กับ ps-3 พร้อมกันแล้วให้ class หลังชนะไม่ได้ — ผู้ชนะขึ้นกับลำดับใน CSS ที่ build ออกมา)
      className={`flex items-center gap-2 rounded-full border py-1.5 pe-3 text-sm font-medium whitespace-nowrap ${
        leading ? 'ps-1.5' : 'ps-3'
      } ${
        on
          ? 'border-primary bg-primary text-white'
          : 'border-default-300 bg-card text-default-800 hover:bg-light'
      }`}
    >
      {leading}
      {label}
    </button>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <p className="text-default-700 mb-2 text-xs font-medium">
        {title}
        {hint && <span className="font-normal"> — {hint}</span>}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

type Props = {
  value: ChatFilterState
  /** ยิงเมื่อกด "ใช้ตัวกรอง"/"ล้างตัวกรอง" เท่านั้น — ไม่ยิงระหว่างเลือก (ดูข้อ 2 หัวไฟล์) */
  onApply: (next: ChatFilterState, pageFilter: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 'ALL' | 'DEEP' | 'MESSENGER' | 'INSTAGRAM' | 'LINE' — ใช้ตัดสินว่าจะโชว์หัวข้อ "ช่องทาง" ไหม
   *  (Deep ไม่มีช่องทางนอกให้เลือก) */
  channelTab: string
  pageFilter: string
  pageOptions: ChannelFilterOption[]
  /** แท็กทั้งหมดที่ร้านเคยใช้ (GET /api/chat/tags) */
  allTags: string[]
  /** ร้านเชื่อม iShip แล้วหรือยัง — ไม่เชื่อม = ไม่ต้องเห็นหัวข้อ "พัสดุ" */
  hasShipping: boolean
}

export default function InboxFilterPanel({
  value,
  onApply,
  open,
  onOpenChange,
  channelTab,
  pageFilter,
  pageOptions,
  allTags,
  hasShipping,
}: Props) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  // ร่าง — sync จากค่าจริงทุกครั้งที่เปิด ไม่ให้ค้างค่าที่เคยเลือกแล้วไม่ได้กดใช้จากรอบก่อน
  const [draft, setDraft] = useState<ChatFilterState>(value)
  const [draftPage, setDraftPage] = useState(pageFilter)
  useEffect(() => {
    if (open) {
      setDraft(value)
      setDraftPage(pageFilter)
    }
  }, [open, value, pageFilter])

  const activeCount = countActiveFilters(value, pageFilter)
  const showPages = channelTab !== 'DEEP' && pageOptions.length > 1

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false)
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', onKey)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onOpenChange])

  const toggleTag = (t: string) =>
    setDraft((d) => ({
      ...d,
      tags: d.tags.includes(t) ? d.tags.filter((x) => x !== t) : [...d.tags, t],
    }))

  return (
    // ไม่มี `relative` ที่ root โดยตั้งใจ — popover อ้างอิง "แถวตัวกรอง" (relative ที่ InboxList)
    // ไม่ใช่ปุ่ม เพื่อให้กว้างเท่าแถวพอดี ไม่ล้น Chat Rail/ขอบจอ
    <div ref={ref}>
      {/* ปุ่มเส้นขอบสี = ของเด่นชิ้นเดียวในส่วนหัว (mockup V1) ที่เหลือถอยเป็นพื้นหลัง */}
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`btn btn-sm bg-card inline-flex items-center gap-2 border ${
          activeCount > 0 || open ? 'border-primary text-primary' : 'border-default-300 text-default-800'
        }`}
      >
        <Icon icon="adjustments-horizontal" className="size-4" />
        {t.inbox.filters}
        {activeCount > 0 && (
          <span className="badge bg-primary text-2xs rounded-full px-1.5 text-white">{activeCount}</span>
        )}
        <Icon icon={open ? 'chevron-up' : 'chevron-down'} className="size-3.5" />
      </button>

      {open && (
        // inset-x-0: กว้างเท่า "แถวตัวกรอง" พอดีเสมอ ไม่ล้น Chat Rail (320px) / ขอบจอมือถือ
        <div
          className="border-default-300 bg-card absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border shadow-lg"
          role="menu"
        >
          <div className="border-default-200 flex items-center justify-between border-b px-3 py-2">
            <span className="text-default-800 text-sm font-semibold">{t.inbox.filters}</span>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-default-700 hover:text-default-800 flex size-6 items-center justify-center rounded"
              aria-label={t.common.close}
            >
              <Icon icon="x" className="size-4" />
            </button>
          </div>

          {/* max-h + scroll: กันเนื้อหายาวทะลุจอจนกดปุ่มท้ายไม่ได้ (บั๊กที่ user เจอจริง 2026-07-31)
              หัวข้อด้านบนกับปุ่มด้านล่างอยู่กับที่ เลื่อนเฉพาะตัวเลือกตรงกลาง */}
          <div className="max-h-96 overflow-y-auto p-3">
            {showPages && (
              // feature 00025 S-14a — หัวข้อ "เพจ" → "ช่องทาง" เพราะรายการนี้ตอนนี้มีทั้งเพจ
              // Facebook และ LINE OA ปนกัน (LINE ไม่ใช่ "เพจ") คำเดิมไม่ครอบทุกตัวเลือกอีกต่อไป
              <Section title={t.inbox.filterPanel.sectionChannel}>
                <Chip on={draftPage === ''} label={t.inbox.filterPanel.allChannels} onClick={() => setDraftPage('')} />
                {pageOptions.map((p, i) => (
                  // ชื่อเพจอย่างเดียวไม่พอ — ร้านที่ตั้งชื่อเพจ Facebook กับ Instagram เหมือนกัน
                  // จะเห็นชิปสองอันข้อความเดียวกันเป๊ะ เลือกไม่ถูก (user report 2026-07-31)
                  // จึงเติมรูปเพจ + โลโก้ช่องทางมุมล่างขวา ชุดเดียวกับที่ใช้ในรายการแชท
                  <Fragment key={p.id}>
                    {/* feature 00037 — คั่นด้วยชื่อร้านเมื่อชิปกลุ่มถัดไปเป็นของอีกร้าน
                        (รายการเรียงตามชื่อร้านมาแล้วจาก listChannelsForShops) โหมดร้านเดียวไม่มี
                        shopName ส่งมา จึงไม่โผล่อะไรเลย — ตัวกรองเดิมหน้าตาเหมือนเดิมเป๊ะ
                        `basis-full` ดันให้ขึ้นบรรทัดใหม่ในกล่อง flex-wrap ของ Section */}
                    {p.shopName && (i === 0 || pageOptions[i - 1]?.shopId !== p.shopId) && (
                      <span className="text-default-700 basis-full text-xs">{p.shopName}</span>
                    )}
                    <Chip
                      on={draftPage === p.id}
                      label={p.name}
                      onClick={() => setDraftPage(p.id)}
                      leading={
                        <span className="relative block shrink-0">
                          <PageAvatar avatarUrl={p.avatarUrl} name={p.name} size="sm" />
                          <ChannelBadgeOverlay channel={p.provider} size="sm" />
                        </span>
                      }
                    />
                  </Fragment>
                ))}
              </Section>
            )}

            {allTags.length > 0 && (
              <Section title={t.inbox.tagsLabel} hint={t.inbox.filterPanel.tagsHint}>
                {allTags.map((t) => (
                  <Chip key={t} on={draft.tags.includes(t)} label={t} onClick={() => toggleTag(t)} />
                ))}
              </Section>
            )}

            {hasShipping && (
              <Section title={t.inbox.filterPanel.sectionShipment}>
                {shipmentOptions(t).map((o) => (
                  <Chip
                    key={o.value}
                    on={draft.shipment === o.value}
                    label={o.label}
                    onClick={() => setDraft((d) => ({ ...d, shipment: o.value }))}
                  />
                ))}
              </Section>
            )}

            <Section title={t.inbox.filterPanel.sectionRead}>
              {readOptions(t).map((o) => (
                <Chip
                  key={o.value}
                  on={draft.readState === o.value}
                  label={o.label}
                  onClick={() => setDraft((d) => ({ ...d, readState: o.value }))}
                />
              ))}
            </Section>

            <Section title={t.menu.customers}>
              {linkedOptions(t).map((o) => (
                <Chip
                  key={o.value}
                  on={draft.customerLinked === o.value}
                  label={o.label}
                  onClick={() => setDraft((d) => ({ ...d, customerLinked: o.value }))}
                />
              ))}
            </Section>

            <Section title={t.inbox.filterPanel.sectionOther}>
              {/* สวิตช์ ไม่ใช่ชิป (user สั่ง 2026-07-31 "อยากให้เป็น toggle เหมือนเดิม") —
                  หัวข้ออื่นเป็นชุดตัวเลือกที่ต้องเลือกหนึ่งอัน แต่อันนี้เป็นเปิด/ปิดเดี่ยว ๆ
                  ชิปเดี่ยวบอกไม่ได้ว่าตอนนี้ปิดอยู่หรือแค่ยังไม่ได้เลือก
                  Base: src/app/(paces)/seller/(dashboard)/settings/ai/AiSettingForm.tsx (form-switch controlled) */}
              <label className="flex w-full cursor-pointer items-center justify-between gap-3">
                <span className="text-default-800 text-sm font-medium">{t.inbox.filterPanel.hiddenLabel}</span>
                <input
                  type="checkbox"
                  className="form-switch shrink-0"
                  checked={draft.hidden}
                  onChange={(e) => setDraft((d) => ({ ...d, hidden: e.target.checked }))}
                />
              </label>
            </Section>
          </div>

          <div className="border-default-200 bg-default-100 flex items-center justify-between border-t px-3 py-2.5">
            <button
              type="button"
              // ล้างแล้วมีผลทันที — คนที่กด "ล้าง" ต้องการเห็นรายการเต็มเดี๋ยวนั้น ไม่ใช่ล้างร่าง
              // แล้วต้องกด "ใช้" ซ้ำอีกที. คง status/spam ไว้เพราะเป็นของแท็บ ไม่ใช่ของแผงนี้
              onClick={() => {
                const cleared = { ...DEFAULT_CHAT_FILTER, status: value.status, spam: value.spam }
                setDraft(cleared)
                setDraftPage('')
                onApply(cleared, '')
              }}
              className="text-default-600 hover:text-default-800 text-sm underline underline-offset-4"
            >
              {t.inbox.filterPanel.clear}
            </button>
            <button
              type="button"
              onClick={() => {
                onApply(draft, draftPage)
                onOpenChange(false)
              }}
              className="btn btn-sm bg-primary hover:bg-primary-hover text-white"
            >
              {t.inbox.filterPanel.apply}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
