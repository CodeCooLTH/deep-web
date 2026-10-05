/**
 * HistoryCard — ประวัติการส่ง 10 ครั้งล่าสุด: ตาราง ≥768px · แถว 2 บรรทัดบนมือถือ
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx (table + `badge bg-{tone}/15`)
 *   + src/app/(paces)/seller/(dashboard)/inventory/movements/[productId]/MovementHistoryTable.tsx (plain `<table class="table table-sm">` + empty state)
 *
 * ป้ายชนิด/ผล มาจาก `list-view` (deliveryKindLabel/deliveryStatusView) — เขียว = ส่งสำเร็จเท่านั้น · สาเหตุใช้ `reasonLabel` จาก API ตรง ๆ (SSOT ห้าม remap) + ต่อ "ข้าม: …" จาก summary (historyReasonText)
 * เวลา: ตารางใช้ `formatDateTime` (date-format.md) · แถวมือถือใช้ `formatDateTimeTH` (ค่าจาก server เป็น ISO — ไม่อ่านนาฬิกา จึงไม่ชน hydration)
 */
import Icon from '@/components/wrappers/Icon'
import { formatDateTime, formatDateTimeTH } from '@/lib/format-date'
import { deliveryKindLabel, deliveryStatusView, historyReasonText } from '@/lib/line-report/list-view'
import type { GroupDetailDto } from '@/services/line-report-group.service'
import { TONE_BADGE } from '../tone'

function StatusBadge({ status }: { status: string }) {
  const v = deliveryStatusView(status)
  return (
    <span className={`badge inline-flex items-center gap-1 ${TONE_BADGE[v.tone]}`}>
      <Icon icon={v.icon} className="text-sm" aria-hidden="true" />
      {v.label}
    </span>
  )
}

export default function HistoryCard({ deliveries }: { deliveries: GroupDetailDto['deliveries'] }) {
  return (
    <section className="card rounded-xl border border-default-300 shadow-sm order-6">
      <div className="card-header">
        <h5 className="card-title flex items-center gap-2">
          <Icon icon="history" className="text-primary text-lg" aria-hidden="true" />
          ประวัติการส่ง 10 ครั้งล่าสุด
        </h5>
      </div>
      {deliveries.length === 0 ? (
        <div className="card-body">
          <p className="text-default-700 mb-0 text-sm">ยังไม่เคยส่งรายงานให้กลุ่มนี้</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="table table-sm">
              <thead className="thead-sm">
                <tr className="bg-light/25 text-2xs">
                  <th>เวลา</th>
                  <th>ประเภท</th>
                  <th>ผล</th>
                  <th>สาเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id}>
                    <td className="text-default-800 text-sm whitespace-nowrap tabular-nums">{formatDateTime(d.at)}</td>
                    <td>
                      <span className={`badge ${TONE_BADGE.neutral}`}>{deliveryKindLabel(d.kind)}</span>
                    </td>
                    <td>
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="text-default-700 text-sm">{historyReasonText(d.reasonLabel, d.summary)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul role="list" className="m-0 list-none p-0 md:hidden">
            {deliveries.map((d) => (
              <li key={d.id} className="border-default-200 border-t px-4 py-2.5 first:border-t-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-default-800 text-sm tabular-nums">
                    {formatDateTimeTH(d.at)} · {deliveryKindLabel(d.kind)}
                  </span>
                  <StatusBadge status={d.status} />
                </div>
                {historyReasonText(d.reasonLabel, d.summary) && <p className="text-default-700 mt-0.5 mb-0 text-xs">{historyReasonText(d.reasonLabel, d.summary)}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
