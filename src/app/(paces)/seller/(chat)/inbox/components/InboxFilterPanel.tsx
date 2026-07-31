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
 * 4. หัวข้อที่ไม่มีความหมายกับร้านนั้นจะไม่แสดง: "เพจ" (ร้านเพจเดียว), "พัสดุ" (ไม่ได้เชื่อม iShip)
 */
import Icon from '@/components/wrappers/Icon'
import { useEffect, useRef, useState } from 'react'
import { ChannelBadgeOverlay, type ChannelFilterOption } from './ChannelBadge'
import { PageAvatar } from './PageFilterDropdown'

export type ShipmentFilterValue = 'all' | 'none' | 'unprinted' | 'printed'

export type ChatFilterState = {
  // status/spam ยังอยู่ใน state (แท็บในส่วนหัวเป็นคนตั้ง) แต่ไม่ได้ render ในแผงนี้แล้ว — ดูข้อ 3
  status: 'open' | 'resolved' | 'all'
  spam: boolean
  /** แท็บ "ทั้งหมด" — ไม่กรองเธรดสแปมทิ้ง (แยกออกด้วยไอคอนแดงหน้าชื่อแทน) */
  includeSpam: boolean
  customerLinked: 'all' | 'linked' | 'unlinked'
  hidden: boolean
  readState: 'all' | 'unread' | 'read'
  /** แท็กผู้ติดต่อ — "ติดอันใดก็ได้" (OR) ตามที่ user เลือก 2026-07-31 */
  tags: string[]
  /** สถานะพัสดุของออเดอร์ล่าสุด (เฉพาะร้านที่เชื่อม iShip) */
  shipment: ShipmentFilterValue
}

export const DEFAULT_CHAT_FILTER: ChatFilterState = {
  // ค่าเริ่มต้น = แท็บ "ทั้งหมด" ที่ถูกไฮไลต์ตอนเปิดหน้า จึงต้องเป็น all/รวมสแปม
  // ไม่งั้นแท็บโชว์ว่าเลือก "ทั้งหมด" อยู่ แต่รายการกรองเฉพาะเธรดที่ยังไม่ปิดงาน
  status: 'all',
  spam: false,
  includeSpam: true,
  customerLinked: 'all',
  hidden: false,
  readState: 'all',
  tags: [],
  shipment: 'all',
}

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

const READ_OPTIONS: { value: ChatFilterState['readState']; label: string }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'unread', label: 'ยังไม่อ่าน' },
  { value: 'read', label: 'อ่านแล้ว' },
]
const LINKED_OPTIONS: { value: ChatFilterState['customerLinked']; label: string }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'linked', label: 'ผูกลูกค้าแล้ว' },
  { value: 'unlinked', label: 'ยังไม่ผูกลูกค้า' },
]
const SHIPMENT_OPTIONS: { value: ShipmentFilterValue; label: string }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'none', label: 'ยังไม่สร้างพัสดุ' },
  { value: 'unprinted', label: 'สร้างแล้ว ยังไม่พิมพ์' },
  { value: 'printed', label: 'พิมพ์แล้ว' },
]

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
      <p className="text-default-500 mb-2 text-xs font-medium">
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
  /** 'ALL' | 'DEEP' | 'MESSENGER' | 'INSTAGRAM' — ใช้ตัดสินว่าจะโชว์หัวข้อ "เพจ" ไหม (Deep ไม่มีเพจ) */
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
        ตัวกรอง
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
            <span className="text-default-800 text-sm font-semibold">ตัวกรอง</span>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-default-500 hover:text-default-800 flex size-6 items-center justify-center rounded"
              aria-label="ปิด"
            >
              <Icon icon="x" className="size-4" />
            </button>
          </div>

          {/* max-h + scroll: กันเนื้อหายาวทะลุจอจนกดปุ่มท้ายไม่ได้ (บั๊กที่ user เจอจริง 2026-07-31)
              หัวข้อด้านบนกับปุ่มด้านล่างอยู่กับที่ เลื่อนเฉพาะตัวเลือกตรงกลาง */}
          <div className="max-h-96 overflow-y-auto p-3">
            {showPages && (
              <Section title="เพจ">
                <Chip on={draftPage === ''} label="ทุกเพจ" onClick={() => setDraftPage('')} />
                {pageOptions.map((p) => (
                  // ชื่อเพจอย่างเดียวไม่พอ — ร้านที่ตั้งชื่อเพจ Facebook กับ Instagram เหมือนกัน
                  // จะเห็นชิปสองอันข้อความเดียวกันเป๊ะ เลือกไม่ถูก (user report 2026-07-31)
                  // จึงเติมรูปเพจ + โลโก้ช่องทางมุมล่างขวา ชุดเดียวกับที่ใช้ในรายการแชท
                  <Chip
                    key={p.id}
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
                ))}
              </Section>
            )}

            {allTags.length > 0 && (
              <Section title="แท็ก" hint="เลือกได้หลายอัน (ติดอันใดก็ได้)">
                {allTags.map((t) => (
                  <Chip key={t} on={draft.tags.includes(t)} label={t} onClick={() => toggleTag(t)} />
                ))}
              </Section>
            )}

            {hasShipping && (
              <Section title="พัสดุ (iShip)">
                {SHIPMENT_OPTIONS.map((o) => (
                  <Chip
                    key={o.value}
                    on={draft.shipment === o.value}
                    label={o.label}
                    onClick={() => setDraft((d) => ({ ...d, shipment: o.value }))}
                  />
                ))}
              </Section>
            )}

            <Section title="การอ่าน">
              {READ_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  on={draft.readState === o.value}
                  label={o.label}
                  onClick={() => setDraft((d) => ({ ...d, readState: o.value }))}
                />
              ))}
            </Section>

            <Section title="ลูกค้า">
              {LINKED_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  on={draft.customerLinked === o.value}
                  label={o.label}
                  onClick={() => setDraft((d) => ({ ...d, customerLinked: o.value }))}
                />
              ))}
            </Section>

            <Section title="อื่น ๆ">
              <Chip
                on={draft.hidden}
                label="ที่ซ่อนไว้"
                onClick={() => setDraft((d) => ({ ...d, hidden: !d.hidden }))}
              />
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
              ล้างตัวกรอง
            </button>
            <button
              type="button"
              onClick={() => {
                onApply(draft, draftPage)
                onOpenChange(false)
              }}
              className="btn btn-sm bg-primary hover:bg-primary-hover text-white"
            >
              ใช้ตัวกรอง
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
