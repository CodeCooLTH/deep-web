'use client'

/**
 * DeskList2D — โหมดรายการ 2D: ข้อมูลชุดเดียวกับฉาก แต่ครบทุกคน (ไม่ตัด 3 คนต่อโต๊ะ — AC-CD-45)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx (table table-hover)
 *   + theme/paces/Admin/TS/src/app/(admin)/ui/list-group/page.tsx (รายการแถวเส้นคั่น) + ui/badges/page.tsx (ชิปสถานะ)
 *   + ui/cards/page.tsx (card + card-header เส้นประ)
 * เลานจ์ = ตารางบน md+ · แถวการ์ด 56px บนมือถือ · โต๊ะ = การ์ดต่อโต๊ะบน md+ · <details> บนมือถือ
 * แถวเกินเวลาตอบมีชิปสถานะในแถวเสมอ ไม่พึ่งสีพื้นแถว
 */
import Icon from '@/components/wrappers/Icon'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import { formatResponseDuration } from '@/lib/agent-performance'
import { CHANNEL_LABEL } from '@/lib/chat-desk/channel-colors'
import type { DeskCustomer, DeskTable } from '@/lib/chat-desk/types'
import { ChannelDot, OnlineDot, StatusChip } from './desk-ui'

const TABLE_ICON: Record<string, string> = { EXTERNAL: 'device-mobile', META_AI: 'sparkles', BOT: 'robot' }

export type DeskList2DProps = {
  lounge: DeskCustomer[]
  /** เลานจ์ถึงเพดาน 200 ห้อง — บอกว่าแสดงเฉพาะที่รอนานสุด */
  loungeCapped: boolean
  /** โต๊ะทั้งหมด (รวมโต๊ะแอดมินที่เกินฉาก) */
  tables: DeskTable[]
  byTable: Record<string, DeskCustomer[]>
  pageName: (pageId: string | null) => string | null
  /** snapshot.serverNow */
  now: number
  onSelectCustomer: (c: DeskCustomer) => void
}

const waited = (c: DeskCustomer, now: number) => (c.since ? formatResponseDuration((now - Date.parse(c.since)) / 1000) : '—')

function TableHead({ t }: { t: DeskTable }) {
  return t.kind === 'ADMIN' ? (
    <>
      <OnlineDot online={t.online} />
      <span className="truncate" title={t.name}>{t.name}</span>
      {t.online !== null && <span className="text-default-400 shrink-0 text-xs font-normal">{t.online ? 'ออนไลน์' : 'ออฟไลน์'}</span>}
    </>
  ) : (
    <>
      <Icon icon={TABLE_ICON[t.kind] ?? 'user'} className="text-default-700 shrink-0 text-base" aria-hidden="true" />
      <span className="truncate" title={t.name}>{t.name}</span>
    </>
  )
}

function TableRooms({ list, now, onSelectCustomer }: { list: DeskCustomer[]; now: number; onSelectCustomer: (c: DeskCustomer) => void }) {
  if (list.length === 0) return <p className="text-default-700 px-3 py-3 text-xs">ไม่มีห้องที่โต๊ะนี้ตอนนี้</p>
  return (
    <ul className="divide-default-200 divide-y px-3">
      {list.map((c) => (
        <li key={c.id}>
          <button type="button" onClick={() => onSelectCustomer(c)} className="hover:bg-default-100 flex min-h-11 w-full items-center gap-2 py-2 text-start text-sm">
            <ChannelDot platform={c.platform} size="size-5" />
            <span className="min-w-0 flex-1 truncate" title={c.name}>{c.name}</span>
            <span className="text-default-700 shrink-0 text-xs">ตอบ {waited(c, now)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export default function DeskList2D({ lounge, loungeCapped, tables, byTable, pageName, now, onSelectCustomer }: DeskList2DProps) {
  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-header">
          <span className="card-title">เลานจ์ · ลูกค้ารอคำตอบ ({loungeCapped ? `${lounge.length}+` : lounge.length})</span>
          <span className="text-default-700 text-xs">เรียงรอนานสุดก่อน</span>
        </div>
        {lounge.length === 0 ? (
          <SellerEmptyState compact icon="message-circle" title="ไม่มีลูกค้ารอคำตอบตอนนี้" description="ห้องที่ลูกค้าทักมาแล้วยังไม่มีใครตอบจะมานั่งรอที่นี่ แสดงย้อนหลัง 7 วัน" />
        ) : (
          <>
            {/* md+ : ตาราง */}
            <div className="hidden md:block">
              <table className="table table-hover text-sm">
                <thead className="bg-default-100 text-default-700 text-xs">
                  <tr>
                    <th scope="col" className="px-4 py-2 text-start font-semibold">ลูกค้า</th>
                    <th scope="col" className="px-4 py-2 text-start font-semibold">ช่องทาง/เพจ</th>
                    <th scope="col" className="px-4 py-2 text-start font-semibold whitespace-nowrap">รอมา</th>
                    <th scope="col" className="px-4 py-2 text-start font-semibold">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-default-200 divide-y">
                  {lounge.map((c) => (
                    <tr key={c.id} onClick={() => onSelectCustomer(c)} className="cursor-pointer">
                      <td className="px-4 py-2.5">
                        <button type="button" onClick={(e) => { e.stopPropagation(); onSelectCustomer(c) }} className="flex min-w-0 items-center gap-2 text-start">
                          <ChannelDot platform={c.platform} />
                          <span className="max-w-56 truncate font-medium" title={c.name}>{c.name}</span>
                        </button>
                      </td>
                      <td className="text-default-700 px-4 py-2.5">
                        <span className="inline-block max-w-64 truncate align-bottom" title={pageName(c.pageId) ?? CHANNEL_LABEL[c.platform]}>
                          {CHANNEL_LABEL[c.platform]}{pageName(c.pageId) ? ` · ${pageName(c.pageId)}` : ''}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{waited(c, now)}</td>
                      <td className="px-4 py-2.5"><StatusChip status={c.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* มือถือ : แถวแตะได้ 56px */}
            <ul className="divide-default-200 divide-y md:hidden">
              {lounge.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => onSelectCustomer(c)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-start">
                    <ChannelDot platform={c.platform} size="size-9" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold" title={c.name}>{c.name}</span>
                        <span className="ms-auto shrink-0"><StatusChip status={c.status} /></span>
                      </span>
                      <span className="text-default-700 block truncate text-xs">
                        {pageName(c.pageId) ?? CHANNEL_LABEL[c.platform]} · รอ {waited(c, now)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {loungeCapped && <p className="text-warning-ink px-3 py-2 text-xs">แสดง 200 ห้องที่รอนานสุด</p>}
      </div>

      <div>
        <h5 className="mb-2 text-sm font-semibold">โต๊ะ</h5>
        <div className="hidden items-start gap-4 md:grid md:grid-cols-2 xl:grid-cols-3">
          {tables.map((t) => {
            const list = byTable[t.key] ?? []
            return (
              <div key={t.key} className={`card ${t.kind === 'ADMIN' && t.online === false ? 'opacity-70' : ''}`}>
                <div className="card-header">
                  <span className="card-title flex min-w-0 items-center gap-1.5"><TableHead t={t} /></span>
                  <span className="text-default-700 shrink-0 text-xs">แชทในมือ <b className="tabular-nums">{list.length}</b></span>
                </div>
                <TableRooms list={list} now={now} onSelectCustomer={onSelectCustomer} />
              </div>
            )
          })}
        </div>
        <div className="card md:hidden">
          {tables.map((t) => {
            const list = byTable[t.key] ?? []
            return (
              <details key={t.key} className="border-default-200 border-b last:border-0">
                <summary className="flex h-12 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium">
                  <Icon icon="chevron-right" className="text-default-400 shrink-0 text-sm" aria-hidden="true" />
                  <TableHead t={t} />
                  <span className="text-default-700 ms-auto shrink-0 text-xs">({list.length})</span>
                </summary>
                <TableRooms list={list} now={now} onSelectCustomer={onSelectCustomer} />
              </details>
            )
          })}
        </div>
      </div>
    </div>
  )
}
