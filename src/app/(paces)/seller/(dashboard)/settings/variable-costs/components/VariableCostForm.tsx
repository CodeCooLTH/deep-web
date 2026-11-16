'use client'

/**
 * ฟอร์มต้นทุนต่อออเดอร์ (feature 00096 P2 · BRD FR-016) — 4 ช่องตัวเลข + ตัวอย่างการคิดต่อใบสด ๆ
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputGroup.tsx
 *   (แถว label ซ้าย 1/3 + input-group ขวา 2/3 · เส้นคั่น dashed) · บันทึกด้วยปุ่ม + pacesToast (HR9)
 */
import { useMemo, useState } from 'react'
import * as v from 'valibot'

import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { formatNumberNoSymbol } from '@/lib/format-money'
import { pacesToast } from '@/lib/paces-toast'
import { orderVariableCost, VariableCostSchema, type VariableCostSettings } from '@/lib/variable-cost'
import InfoTip from '../../../reports/ad-revenue/components/InfoTip'

type Key = keyof VariableCostSettings
const EXAMPLE_AMOUNT = 1000

export default function VariableCostForm({ initial }: { initial: VariableCostSettings }) {
  const t = useT().variableCosts
  const [draft, setDraft] = useState<Record<Key, string>>(() => ({
    packagingPerOrder: String(initial.packagingPerOrder),
    codFeePct: String(initial.codFeePct),
    paymentFeePct: String(initial.paymentFeePct),
    commissionPct: String(initial.commissionPct),
  }))
  const [busy, setBusy] = useState(false)

  const parsed = useMemo(() => {
    const n = Object.fromEntries(Object.entries(draft).map(([k, x]) => [k, x.trim() === '' ? 0 : Number(x)]))
    return v.safeParse(VariableCostSchema, n)
  }, [draft])

  const rows: { key: Key; label: string; unit: string; tip?: string; step: string }[] = [
    { key: 'packagingPerOrder', label: t.packaging, unit: t.packagingUnit, step: '0.01' },
    { key: 'codFeePct', label: t.codFee, unit: t.pctUnit, tip: t.codFeeTip, step: '0.01' },
    { key: 'paymentFeePct', label: t.paymentFee, unit: t.pctUnit, tip: t.paymentFeeTip, step: '0.01' },
    { key: 'commissionPct', label: t.commission, unit: t.pctUnit, step: '0.01' },
  ]

  const save = async () => {
    if (!parsed.success) return pacesToast.error(t.invalid)
    setBusy(true)
    try {
      const res = await fetch('/api/shops/current/variable-costs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.output),
      })
      if (!res.ok) throw new Error(String(res.status))
      pacesToast.success(t.saved)
    } catch {
      pacesToast.error(t.saveFailed)
    } finally {
      setBusy(false)
    }
  }

  const examples = parsed.success
    ? ([
        [t.exampleCod, 'COD'],
        [t.exampleTransfer, 'TRANSFER'],
        [t.exampleCash, 'CASH'],
      ] as const).map(([label, pm]) => ({ label, cost: orderVariableCost(parsed.output, { revenue: EXAMPLE_AMOUNT, paymentMethod: pm, ishipCodFee: null, codFeeInShipping: false }) }))
    : []

  return (
    <div className="grid grid-cols-1 gap-base lg:grid-cols-3">
      <div className="card lg:col-span-2">
        <div className="card-header">
          <h4 className="card-title">{t.cardTitle}</h4>
          <InfoTip text={t.tip} />
        </div>
        <div className="card-body">
          {rows.map((r, i) => (
            <div key={r.key}>
              {i > 0 && <div className="border-default-300 my-base border-t border-dashed" />}
              <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-3 lg:gap-9">
                <div className="flex items-center gap-1.5">
                  <label htmlFor={`vc-${r.key}`} className="form-label mb-0! py-2">{r.label}</label>
                  {r.tip && <InfoTip text={r.tip} />}
                </div>
                <div className="lg:col-span-2">
                  <div className="input-group">
                    <input
                      id={`vc-${r.key}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step={r.step}
                      className="form-input text-end tabular-nums"
                      value={draft[r.key]}
                      disabled={busy}
                      onChange={(e) => setDraft((d) => ({ ...d, [r.key]: e.target.value }))}
                    />
                    <span className="input-group-text">{r.unit}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {!parsed.success && <p className="text-danger-ink mt-3 mb-0 text-sm">{t.invalid}</p>}
          <div className="mt-base flex justify-end">
            <button type="button" className="btn bg-primary text-white" disabled={busy || !parsed.success} onClick={save}>
              {t.save}
            </button>
          </div>
        </div>
      </div>

      <aside className="card self-start">
        <div className="card-header">
          <h4 className="card-title">{fmt(t.exampleTitle, { amount: formatNumberNoSymbol(EXAMPLE_AMOUNT) })}</h4>
        </div>
        <div className="card-body">
          <ul className="grid gap-2.5">
            {examples.map((x) => (
              <li key={x.label} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-default-700">{x.label}</span>
                <span className="text-dark font-semibold tabular-nums">{formatNumberNoSymbol(x.cost)}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  )
}
