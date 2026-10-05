/**
 * ReportGroupRow — แถวกลุ่มรายงานหนึ่งแถว · RSC
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/channels/LineChannelCard.tsx (แถว: ไอคอน + โลโก้ LINE ซ้อนมุม + ชื่อ truncate+title + ป้ายสถานะ)
 * ← theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (.card) + ui/badges/page.tsx (.badge)
 *
 * ทั้งแถวเป็นลิงก์ (min-h-11) · ปุ่ม "ผูกใหม่" เป็นลิงก์พี่น้องใต้แถว ไม่ซ้อน anchor ใน anchor
 * lg = grid 12 คอลัมน์ (ชื่อ+ร้าน 5 · สถานะ+ถัดไป 4 · ล่าสุด 3) · ป้าย/ข้อความทุกอย่างมาจาก presenter + list-view
 * ข้อความรอง `text-default-700` (ไม่ใช่ 400) เพื่อผ่าน contrast
 */
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { groupBadge } from '@/lib/line-report/presenter'
import { groupKindLabel, lastDeliveryView, statusLine, type ListGroupItem } from '@/lib/line-report/list-view'
import CodeCountdown from './CodeCountdown'
import GroupStatusBadge from './GroupStatusBadge'
import { TONE_TEXT } from './tone'

export default function ReportGroupRow({ group, now }: { group: ListGroupItem; now: Date }) {
  const badge = groupBadge({ status: group.status }, group.paused)
  const line = statusLine(group, now)
  const last = lastDeliveryView(group.lastDelivery, now)
  const extra = Math.max(0, group.shopCount - group.shops.length)
  const href = `/business/line-reports/${group.id}`

  return (
    <li className="border-default-200 border-b last:border-0">
      <Link href={href} className="hover:bg-light flex min-h-11 items-center gap-3 px-4 py-3">
        <span className="relative shrink-0">
          <span className="bg-light text-default-700 flex size-10 items-center justify-center rounded-lg">
            <Icon icon="users" className="text-xl" aria-hidden="true" />
          </span>
          <span className="ring-card absolute -right-1 -bottom-1 block size-4 overflow-hidden rounded-full ring-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logos/line.svg" alt="" aria-hidden="true" className="size-full object-cover" />
          </span>
        </span>

        <div className="min-w-0 flex-1 lg:grid lg:grid-cols-12 lg:items-center lg:gap-4">
          <div className="min-w-0 lg:col-span-5">
            <p className="text-default-800 mb-0 truncate text-sm font-medium" title={group.groupName}>
              {group.groupName}
            </p>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="text-default-700 text-xs">{groupKindLabel(group.shopCount)}</span>
              {group.shops.map((s) => (
                <span key={s.id} title={s.name} className="bg-light text-default-700 inline-block max-w-40 truncate rounded px-2 py-0.5 align-bottom text-xs">
                  {s.name}
                </span>
              ))}
              {extra > 0 && <span className="bg-light text-default-700 rounded px-2 py-0.5 text-xs">+{extra}</span>}
            </div>
          </div>

          <div className="mt-2 min-w-0 lg:col-span-4 lg:mt-0">
            <GroupStatusBadge badge={badge} />
            <p className="text-default-700 mt-1 mb-0 text-xs">
              {line.kind === 'countdown' ? (
                <CodeCountdown expiresAt={line.expiresAt} prefix="รอผูก · โค้ดใช้ได้อีก " expiredText="รอผูก · โค้ดหมดอายุ ต้องสร้างโค้ดใหม่" />
              ) : (
                line.text
              )}
            </p>
          </div>

          <p className="text-default-700 mt-1 mb-0 text-xs lg:col-span-3 lg:mt-0">
            {last ? (
              <>
                ล่าสุด {last.when} ·{' '}
                <span className="inline-flex items-center gap-1 align-bottom">
                  <Icon icon={last.icon} className={`text-sm ${TONE_TEXT[last.tone]}`} aria-hidden="true" />
                  {last.label}
                </span>
              </>
            ) : (
              'ยังไม่เคยส่ง'
            )}
          </p>
        </div>

        <Icon icon="chevron-right" className="text-default-700 shrink-0 text-lg" aria-hidden="true" />
      </Link>

      {badge.key === 'BOT_REMOVED' && (
        <div className="px-4 pb-3 pl-17">
          <Link href={href} className="btn btn-sm bg-danger/15 text-danger-ink hover:bg-danger/25 inline-flex items-center gap-1.5">
            <Icon icon="refresh" className="text-base" aria-hidden="true" />
            ผูกใหม่
          </Link>
        </div>
      )}
    </li>
  )
}
