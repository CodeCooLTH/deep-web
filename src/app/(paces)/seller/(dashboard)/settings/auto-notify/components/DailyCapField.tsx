'use client'

/**
 * ช่องเพดานข้อความต่อลูกค้าต่อวัน (feature 00078 T17 · S-9)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/forms/elements/components/ChecksRadioSwitches.tsx (form-input)
 *   พฤติกรรมบันทึก: ReportSettingsForm.tsx — optimistic ไม่ได้ (ช่องพิมพ์) จึงล็อก readOnly ระหว่างส่ง
 *
 * บันทึกตอน blur/Enter · ค่าไม่เปลี่ยนหรือไม่ผ่านกติกา = ไม่ส่งอะไรเลย · Esc คืนค่าที่บันทึกไว้
 */
import { useRef, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { parseDailyCap } from '@/lib/auto-notify/settings-ui'
import { pacesToast } from '@/lib/paces-toast'

export default function DailyCapField({ initial, canEdit }: { initial: number; canEdit: boolean }) {
  const t = useT().autoNotify
  const [saved, setSaved] = useState(initial)
  const [text, setText] = useState(String(initial))
  const [invalid, setInvalid] = useState(false)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false) // Enter แล้ว blur ตามมาทันที — กันส่งซ้ำก่อน state busy ทัน render

  const commit = async () => {
    if (!canEdit || inFlight.current) return
    const n = parseDailyCap(text)
    if (n === null) return setInvalid(true)
    setInvalid(false)
    setText(String(n))
    if (n === saved) return
    inFlight.current = true
    setBusy(true)
    try {
      const res = await fetch('/api/shops/current/auto-notify/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyCapPerRoom: n }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setSaved(n)
      pacesToast.success(t.toastCapSaved)
    } catch {
      setText(String(saved)) // revert
      pacesToast.error(t.toastFailed)
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const describedBy = ['an-cap-hint', invalid ? 'an-cap-err' : null, canEdit ? null : 'an-ro'].filter(Boolean).join(' ')
  return (
    <div className="border-default-200 mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
      <Icon icon="adjustments-horizontal" className="text-default-500 size-5 shrink-0" aria-hidden="true" />
      <span id="an-cap-prefix" className="text-default-900 text-sm">
        {t.capPrefix}
      </span>
      <input
        type="text"
        inputMode="numeric"
        className={`form-input w-16! flex-none text-center text-sm ${invalid ? 'border-danger' : ''}`}
        value={text}
        disabled={!canEdit}
        readOnly={busy}
        aria-busy={busy || undefined}
        aria-invalid={invalid || undefined}
        aria-labelledby="an-cap-prefix an-cap-suffix"
        aria-describedby={describedBy}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void commit()
          } else if (e.key === 'Escape') {
            setText(String(saved))
            setInvalid(false)
          }
        }}
      />
      <span id="an-cap-suffix" className="text-default-900 text-sm">
        {t.capSuffix}
      </span>
      {busy && <span className="text-default-700 text-xs">{t.capSaving}</span>}
      <p id="an-cap-hint" className="text-default-600 basis-full text-xs">
        {t.capHint}
      </p>
      {invalid && (
        <p id="an-cap-err" className="text-danger-ink basis-full text-xs">
          {t.capInvalid}
        </p>
      )}
    </div>
  )
}
