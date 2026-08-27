'use client'

/**
 * ReportFilters — แถบตัวกรองของรายงานผลงานแอดมิน (feature 00059)
 *
 * Base (toolbar/dropdown): src/components/safepay/FilterDropdown.tsx
 *   ซึ่ง copy markup มาจาก theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx
 * Base (ช่องวันที่ + ปุ่ม preset): src/app/(paces)/seller/(dashboard)/sales/components/SalesDateRange.tsx
 *   (แพตเทิร์นเดิมของโปรเจกต์: input type="date" คู่กับ ?from=&to= ใน URL ไม่ใช่ Flatpickr)
 *
 * 🛑 ตัวกรองอยู่ใน URL ไม่ใช่ใน React state — ผู้จัดการต้องส่งลิงก์ของ "ช่วงที่กำลังดูอยู่"
 * ให้กันได้ และปุ่มย้อนกลับของเบราว์เซอร์ต้องพากลับไปที่ช่วงเดิม
 */
import { useCallback, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import FilterDropdown from '@/components/safepay/FilterDropdown'
import Icon from '@/components/wrappers/Icon'
import { CHAT_CHANNELS, getChannelLabel } from '@/lib/chat-channel'
import { REPORT_SOURCES } from '@/lib/agent-report-query'
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

  /** ปุ่มลัด: N วันล่าสุด (รวมวันนี้) — คิดขอบด้วยเวลาไทยเหมือนฝั่ง server */
  const preset = (days: number) => {
    const nowTh = new Date(Date.now() + 7 * 60 * 60 * 1000)
    const end = nowTh.toISOString().slice(0, 10)
    const start = new Date(nowTh.getTime() - (days - 1) * 86400000).toISOString().slice(0, 10)
    push({ from: start, to: end })
  }

  return (
    <div className="card mb-4">
      <div className="card-body flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <label className="text-default-700 shrink-0 text-sm" htmlFor="report-from">
              ช่วงเวลา
            </label>
            <input
              id="report-from"
              type="date"
              className="form-input w-40"
              value={props.from}
              max={props.to}
              onChange={(e) => push({ from: e.target.value })}
            />
            <span className="text-default-500">–</span>
            <input
              id="report-to"
              type="date"
              aria-label="ถึงวันที่"
              className="form-input w-40"
              value={props.to}
              min={props.from}
              onChange={(e) => push({ to: e.target.value })}
            />
          </div>

          <div className="flex items-center gap-2">
            {/* 🛑 `btn-light` **ไม่มีอยู่จริงในธีม** — ที่ grep เจอคือ `.btn-light.active` ของ
                toolbar กราฟใน `plugins/_apexcharts.css` ไม่ใช่ปุ่ม variant (มีคน ship คลาสนี้
                ขึ้น prod แล้วได้ตัวหนังสือลอยไม่มีพื้นหลัง 2026-08-15)
                ของจริงใน `_buttons.css` มีแค่ .btn/.btn-lg/.btn-sm/.btn-icon ⇒ ต้องต่อสีเอง */}
            <button
              type="button"
              className="btn btn-sm bg-light text-dark hover:bg-light-hover"
              onClick={() => preset(7)}>
              7 วัน
            </button>
            <button
              type="button"
              className="btn btn-sm bg-light text-dark hover:bg-light-hover"
              onClick={() => preset(30)}>
              30 วัน
            </button>
          </div>

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
