'use client'

/**
 * TestRoomsCard — "แชทสำหรับทดสอบ" (โผล่เมื่อเลือกสถานะ "ทดสอบ"): Select2 หลายค่า ค้นชื่อลูกค้าผ่าน `test-rooms?channelIds=&q=` (00095 S-7 · mockup ส่วน 3)
 * react-select ฐานไม่มี async — ใช้ `onInputChange` + `filterOption={null}` โหลดตัวเลือกเอง (หน่วง 300ms) · ไม่ได้เลือกช่องทาง = disabled + เหตุผล
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/select/components/Select2.tsx (isMulti) · card + card-header ของ AutoNotifyClient
 */
import { useEffect, useRef, useState } from 'react'

import { getChannelDisplay } from '@/app/(paces)/seller/(chat)/inbox/components/ChannelBadge'
import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { SALES_FOLLOW_LIMITS as L } from '@/lib/sales-follow-bot/constants'
import type { TestRoomItem } from '@/services/sales-follow-bot.service'
import SfbSelect from './SfbSelect'
import { StatusBadge } from './sfb-ui'

type Opt = { value: string; label: string; channel: string }
const toOpt = (r: TestRoomItem): Opt => ({ value: r.conversationId, label: r.contactName, channel: r.channel })

export default function TestRoomsCard({
  channelIds,
  selected,
  onChange,
  error,
}: {
  channelIds: readonly string[]
  /** แชทที่เลือกไว้ (มีชื่อ/ช่องทางให้โชว์) */
  selected: readonly TestRoomItem[]
  onChange: (rooms: TestRoomItem[]) => void
  error: string | null
}) {
  const t = useT().salesFollowBot
  const [options, setOptions] = useState<Opt[]>([])
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [q, setQ] = useState('')
  const seq = useRef(0)
  const catalog = useRef(new Map<string, TestRoomItem>())
  for (const r of selected) catalog.current.set(r.conversationId, r)
  const channelKey = channelIds.join(',')
  const noChannel = channelIds.length === 0

  useEffect(() => {
    if (!channelKey) return
    const mine = ++seq.current
    const timer = setTimeout(async () => {
      setLoading(true)
      setLoadFailed(false)
      try {
        const res = await fetch(`/api/shops/current/sales-follow-bot/test-rooms?channelIds=${encodeURIComponent(channelKey)}&q=${encodeURIComponent(q)}`, { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as { rooms: TestRoomItem[] }
        if (mine !== seq.current) return // คำตอบเก่าของคำค้นก่อนหน้า
        for (const r of data.rooms) catalog.current.set(r.conversationId, r)
        setOptions(data.rooms.map(toOpt))
      } catch {
        if (mine === seq.current) setLoadFailed(true)
      } finally {
        if (mine === seq.current) setLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [channelKey, q])

  const full = selected.length >= L.maxTestRooms
  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">{t.testTitle}</h4>
        <StatusBadge status="TESTING" />
      </div>
      <div className="card-body">
        <label htmlFor="sfb-test-rooms" className="form-label text-sm">
          {fmt(t.testHint, { max: L.maxTestRooms })}
        </label>
        <SfbSelect
          inputId="sfb-test-rooms"
          isMulti
          isClearable
          isDisabled={noChannel}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'sfb-test-err' : 'sfb-test-note'}
          placeholder={t.testPlaceholder}
          options={full ? [] : options}
          value={selected.map(toOpt)}
          filterOption={null}
          isLoading={loading}
          loadingMessage={() => t.testSearching}
          noOptionsMessage={() => (loadFailed ? t.testLoadFailed : t.testNone)}
          onInputChange={(v: string, meta: { action: string }) => {
            if (meta.action === 'input-change') setQ(v)
            return v
          }}
          formatOptionLabel={(o: unknown) => {
            const opt = o as Opt
            const d = getChannelDisplay(opt.channel)
            return (
              <span className="inline-flex items-center gap-1.5">
                {d.logoSrc && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.logoSrc} alt={d.label} width={14} height={14} className="size-3.5 rounded-full" />
                )}
                {opt.label}
              </span>
            )
          }}
          onChange={(v: unknown) => {
            const list = (v as readonly Opt[] | null) ?? []
            onChange(list.map((o) => catalog.current.get(o.value)).filter((r): r is TestRoomItem => !!r))
          }}
        />
        {noChannel && <p className="text-default-700 mt-1 text-xs">{t.testNeedChannel}</p>}
        {error && (
          <p id="sfb-test-err" role="alert" className="text-danger-ink mt-1 flex items-start gap-1 text-xs">
            <Icon icon="alert-circle" className="mt-0.5 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}
        <p id="sfb-test-note" className="text-default-700 mt-1 text-xs">
          {t.testNote}
        </p>
      </div>
    </div>
  )
}
