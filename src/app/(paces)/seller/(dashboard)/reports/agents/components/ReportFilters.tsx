'use client'

/**
 * ReportFilters — แถบตัวกรองของรายงานผลงานแอดมิน (feature 00059)
 *
 * Base (toolbar/dropdown): src/components/safepay/FilterDropdown.tsx
 *   ซึ่ง copy markup มาจาก theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx
 * Base (ช่วงเวลา): ../../../_shared/DateRangeControl.tsx — ตัวเดียวกับหน้าการเงิน (2026-10-01)
 *   เดิมเป็นช่องวันที่ของเบราว์เซอร์ 2 ช่อง + ปุ่ม 7/30 วัน คนละหน้าตากับหน้ารายงานพี่น้องทุกหน้า
 *   และที่ 320px ช่องวันที่เหลือ ~88px จนวันที่ถูกตัด (audit responsive) · URL ยังเป็น ?from=&to= เหมือนเดิม
 *
 * 🛑 ตัวกรองอยู่ใน URL ไม่ใช่ใน React state — ผู้จัดการต้องส่งลิงก์ของ "ช่วงที่กำลังดูอยู่"
 * ให้กันได้ และปุ่มย้อนกลับของเบราว์เซอร์ต้องพากลับไปที่ช่วงเดิม
 */
import { useCallback, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import FilterDropdown from '@/components/safepay/FilterDropdown'
import Icon from '@/components/wrappers/Icon'
import { CHAT_CHANNELS, getChannelLabel } from '@/lib/chat-channel'
import { REPORT_SOURCES } from '@/lib/agent-report-query'
import { DATE_RANGE_OPTIONS, resolveDateRange, type DateRangePreset } from '@/lib/date-range'
import DateRangeControl from '../../../_shared/DateRangeControl'
import { SOURCE_LABEL } from './data'

type Props = {
  from: string
  to: string
  channel: string | null
  source: string | null
  shopChannelId: string | null
  channels: { id: string; name: string; provider: string }[]
  /** ผู้ใช้ขอช่วงยาวเกินเพดานแล้วถูกหั่น — ต้องบอก ห้ามหั่นเงียบ ๆ */
  clamped: boolean
  maxRangeDays: number
}

const ALL = 'ALL'

export default function ReportFilters(props: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  /** เขียนค่าลง URL แล้วให้ RSC โหลดใหม่ — คงค่าที่เหลือไว้เสมอ (ตัวกรองคนละแกนกัน) */
  const push = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString())
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '' || v === ALL) next.delete(k)
        else next.set(k, v)
      }
      startTransition(() => router.push(`${pathname}?${next.toString()}`))
    },
    [params, pathname, router],
  )

  /**
   * preset ไหนตรงกับ from/to ที่อยู่ใน URL — คำนวณจาก resolveDateRange ตัวเดียวกับหน้าการเงิน
   * (ไม่ตรงตัวไหน = กำหนดเอง) · ลิงก์ที่แชร์กันจึงยังเป็น ?from=&to= ตรง ๆ ไม่ผูกกับชื่อ preset
   */
  const urlRange: DateRangePreset =
    DATE_RANGE_OPTIONS.map((o) => o.value)
      .filter((v): v is Exclude<DateRangePreset, 'custom'> => v !== 'custom')
      .find((v) => {
        const l = resolveDateRange(v).label
        return l.start === props.from && l.end === props.to
      }) ?? 'custom'

  // กด "กำหนดเอง" = เปิดปฏิทินก่อน ยังไม่ยิงหน้าใหม่ · URL เปลี่ยนจากทางอื่น (back) → ตามค่าใน URL
  const [localRange, setLocalRange] = useState<DateRangePreset>(urlRange)
  const [prevUrlRange, setPrevUrlRange] = useState<DateRangePreset>(urlRange)
  if (urlRange !== prevUrlRange) {
    setPrevUrlRange(urlRange)
    setLocalRange(urlRange)
  }

  return (
    <div className="card mb-4">
      <div className="card-body flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeControl
            range={localRange}
            customDates={[props.from, props.to]}
            pending={pending}
            onRangeChange={(next) => {
              setLocalRange(next)
              if (next === 'custom') return
              const l = resolveDateRange(next).label
              push({ from: l.start, to: l.end })
            }}
            onCustomChange={([from, to]) => {
              setLocalRange('custom')
              push({ from, to })
            }}
          />

          <div className="ms-auto flex flex-wrap items-center gap-2">
            <FilterDropdown
              icon="messages"
              value={props.channel ?? ALL}
              resetValue={ALL}
              defaultLabel="ช่องทาง"
              options={[
                { value: ALL, label: 'ทุกช่องทาง' },
                ...CHAT_CHANNELS.map((c) => ({ value: c, label: getChannelLabel(c) })),
              ]}
              onChange={(v) => push({ channel: v })}
            />
            <FilterDropdown
              icon="target-arrow"
              value={props.source ?? ALL}
              resetValue={ALL}
              defaultLabel="ที่มา"
              options={[
                { value: ALL, label: 'ทุกที่มา' },
                ...REPORT_SOURCES.map((s) => ({ value: s, label: SOURCE_LABEL[s] })),
              ]}
              onChange={(v) => push({ source: v })}
            />
            {props.channels.length > 1 && (
              <FilterDropdown
                icon="brand-facebook"
                align="right"
                value={props.shopChannelId ?? ALL}
                resetValue={ALL}
                defaultLabel="เพจ/บัญชี"
                options={[
                  { value: ALL, label: 'ทุกเพจ/บัญชี' },
                  ...props.channels.map((c) => ({ value: c.id, label: c.name })),
                ]}
                onChange={(v) => push({ shopChannelId: v })}
              />
            )}
          </div>
        </div>

        {props.clamped && (
          /* หั่นช่วงให้แล้ว — ต้องบอกทันที ไม่งั้นผู้ใช้อ่านตัวเลขของช่วงที่ตัวเองไม่ได้ขอ */
          <p className="text-warning-ink bg-warning/15 flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
            <Icon icon="alert-triangle" className="shrink-0 text-base" aria-hidden="true" />
            ดูย้อนหลังได้ครั้งละไม่เกิน {props.maxRangeDays} วัน — ระบบปรับวันเริ่มต้นให้แล้ว
          </p>
        )}

        {pending && (
          <p className="text-default-500 flex items-center gap-2 text-sm" role="status">
            <Icon icon="loader-2" className="animate-spin text-base" aria-hidden="true" />
            กำลังคำนวณใหม่…
          </p>
        )}
      </div>
    </div>
  )
}
