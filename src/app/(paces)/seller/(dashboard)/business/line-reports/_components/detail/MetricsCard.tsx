'use client'

/**
 * MetricsCard — ตัวเลขที่แสดงในข้อความ: 4 ตัวหลัก + กำไร (แถวท้าย คั่นเส้นประ · ติ๊กแล้วต้องผ่าน Swal ยืนยัน)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx (`form-checkbox`)
 *   + theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx (ผ่าน `pacesConfirm.warning` ของ src/lib/paces-swal.ts)
 *   + src/lib/paces-swal.ts (pacesConfirm.warning — เปิด = confirm ก่อน · ปิด = ยิงตรง)
 *
 * เปิดกำไร: ยืนยันก่อนแล้วส่ง `{showProfit:true, confirmProfit:true}` คำขอเดียว ไม่ debounce (ผ่าน onChange immediate)
 * ตัวสุดท้ายที่ติ๊กอยู่ปิดไม่ได้ (METRIC_REQUIRED) — ตัดสินที่ `isLastMetric`
 */
import Icon from '@/components/wrappers/Icon'
import { pacesConfirm } from '@/lib/paces-swal'
import type { SettingsPatch } from '@/lib/line-report/autosave'
import { METRIC_KEYS, METRIC_REQUIRED_HELPER, isLastMetric, type MetricKey } from '@/lib/line-report/settings-guards'
import type { GroupDetailDto } from '@/services/line-report-group.service'
import { CheckRow } from './Rows'

export default function MetricsCard({
  settings,
  canEdit,
  orderWord,
  onChange,
}: {
  settings: GroupDetailDto['settings']
  canEdit: boolean
  orderWord: string
  onChange: (patch: SettingsPatch, opts?: { immediate?: boolean }) => void
}) {
  const labels: Record<Exclude<MetricKey, 'showProfit'>, string> = {
    showOrders: `จำนวน${orderWord}`,
    showSales: 'ยอดขาย',
    showCancelled: 'ยกเลิก',
    showTopProducts: 'ขายดี 3 อันดับ (แยกรายร้าน)', // คำกลาง — ร้านบริการ/สินค้าใช้คนละคำ
  }
  const main = METRIC_KEYS.filter((k): k is Exclude<MetricKey, 'showProfit'> => k !== 'showProfit')
  const anyLast = METRIC_KEYS.some((k) => isLastMetric(settings, k))

  async function toggleProfit(next: boolean) {
    if (!next) return onChange({ showProfit: false })
    const ok = await pacesConfirm.warning('แสดงกำไรในกลุ่ม LINE?', 'ทุกคนในกลุ่มนี้จะเห็นตัวเลขกำไรของร้านที่เลือก ปิดได้ทุกเมื่อ', {
      confirmButtonText: 'แสดงกำไร',
      cancelButtonText: 'ยกเลิก',
    })
    if (ok) onChange({ showProfit: true, confirmProfit: true }, { immediate: true })
  }

  return (
    <section className="card order-3">
      <div className="card-header">
        <h5 className="card-title flex items-center gap-2">
          <Icon icon="list-numbers" className="text-primary text-lg" aria-hidden="true" />
          ตัวเลขที่แสดง
        </h5>
      </div>
      <div className="card-body">
        {main.map((k) => (
          <CheckRow key={k} label={labels[k]} checked={settings[k]} disabled={!canEdit || isLastMetric(settings, k)} onChange={(v) => onChange({ [k]: v })} />
        ))}
        {anyLast && <p className="text-default-700 mb-0 text-xs">{METRIC_REQUIRED_HELPER}</p>}

        <div className="border-default-300 my-base border-t border-dashed" />

        <CheckRow
          label="กำไร"
          sub={settings.showProfit ? undefined : 'ทุกคนในกลุ่ม LINE จะเห็นตัวเลขกำไร รวมถึงคนที่ไม่ได้มีสิทธิ์ดูการเงินในร้าน — ติ๊กแล้วจะถามยืนยันก่อน'}
          checked={settings.showProfit}
          disabled={!canEdit || isLastMetric(settings, 'showProfit')}
          onChange={toggleProfit}
        />
        {settings.showProfit && (
          <div role="status" className="bg-warning/15 text-warning-ink mt-1 flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
            <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-lg" aria-hidden="true" />
            <p className="mb-0">ทุกคนในกลุ่ม LINE จะเห็นตัวเลขกำไร รวมถึงคนที่ไม่ได้มีสิทธิ์ดูการเงินในร้าน</p>
          </div>
        )}
      </div>
    </section>
  )
}
