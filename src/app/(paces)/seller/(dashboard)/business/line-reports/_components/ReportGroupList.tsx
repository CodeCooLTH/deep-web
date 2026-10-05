/**
 * ReportGroupList — การ์ด "กลุ่มรายงานของฉัน" (หัว + ปุ่มเพิ่มกลุ่ม + แถว) · RSC
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (CardWithHeader)
 * + src/app/(paces)/seller/(dashboard)/business/components/QuotaUsageCard.tsx (หัวการ์ด + ปุ่มขวา · ห้ามซ้อนการ์ด)
 *
 * เหตุที่เพิ่มกลุ่มไม่ได้มาจาก `createBlockedReason` (lib) — ที่นี่แสดงอย่างเดียว ไม่ตัดสินเอง
 */
import { createBlockedReason, sortGroups, type ListGroupItem, type ListMeta } from '@/lib/line-report/list-view'
import AddGroupButton, { CREATE_BLOCKED_ID } from './AddGroupButton'
import ReportGroupRow from './ReportGroupRow'

export default function ReportGroupList({ groups, meta, now }: { groups: ListGroupItem[]; meta: ListMeta; now: Date }) {
  const blocked = createBlockedReason(meta)
  return (
    <div className="card mb-base">
      <div className="card-header flex flex-wrap items-center justify-between gap-3">
        <h4 className="card-title">
          กลุ่มรายงานของฉัน <span className="text-default-700 text-xs font-normal">{meta.count} จาก {meta.limit} กลุ่ม</span>
        </h4>
        <AddGroupButton canCreate={blocked === null} />
      </div>
      {blocked && (
        <p id={CREATE_BLOCKED_ID} className="text-default-700 mt-3 mb-0 px-4 text-xs">
          {blocked}
        </p>
      )}
      <ul className="m-0 list-none p-0">
        {sortGroups(groups).map((g) => (
          <ReportGroupRow key={g.id} group={g} now={now} />
        ))}
      </ul>
    </div>
  )
}
