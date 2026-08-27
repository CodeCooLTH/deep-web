'use client'

/**
 * AgentLeaderboard — ตารางจัดอันดับผลงานแอดมิน (feature 00059)
 *
 * Base: src/app/(paces)/seller/(dashboard)/customers/components/CustomerTable.tsx
 *   (ซึ่ง copy มาจาก theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/customers/components/
 *    CustomerTable.tsx อีกที) — `.card` + `.card-header` + `DataTable` + `mobileCard`
 *   + `onRowClick` + `TablePagination` ชุดเดียวกันทั้งหมด
 *
 * ── ทำไมเรียงที่ client ────────────────────────────────────────────────────
 * แถวหนึ่งแถวคือ "คนหนึ่งคนในร้าน" — ร้านที่ใหญ่ที่สุดในระบบมีพนักงานหลักสิบ ไม่ใช่หลักพัน
 * การส่งไปเรียงที่ server แล้วโหลดใหม่ทั้งหน้าจึงแพงกว่าผลที่ได้ (ต่างจาก `/orders` ที่
 * ย้ายไป server เพราะแถวเป็นหลักร้อยต่อหน้าและโตไม่จำกัด)
 *
 * 🛑 ไม่มี "คะแนนรวม" โดยตั้งใจ (โจทย์ข้อ 3 สั่งไว้) — ผู้จัดการต้องเห็นตัวเลขดิบก่อน
 * การยุบหลายมิติเป็นเลขเดียวต้องมีน้ำหนักที่ตกลงกันแล้ว ซึ่งยังไม่มี
 */
import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

import ListBusyOverlay, { useListBusy } from '../../../_shared/ListBusyOverlay'
import AgentDetailModal from './AgentDetailModal'

import DataTable from '@/components/table/DataTable'
import TablePagination from '@/components/table/TablePagination'
import SellerEmptyState from '../../../_shared/SellerEmptyState'
import Icon from '@/components/wrappers/Icon'
import { formatBaht } from '@/lib/format-money'
import { formatPercent, formatResponseDuration } from '@/lib/agent-performance'
import {
  createColumnHelper,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import type { LeaderboardRow } from './data'

const columnHelper = createColumnHelper<LeaderboardRow>()

/** ตัวเลขที่ยังไม่มีตัวอย่าง ต้องอ่านว่า "—" ไม่ใช่ 0 (ดูเหตุผลใน agent-performance.ts) */
const num = (n: number) => n.toLocaleString('th-TH')

function AgentCell({ row }: { row: LeaderboardRow }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {row.avatar ? (
        <Image
          src={row.avatar}
          alt=""
          width={32}
          height={32}
          className="size-8 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="bg-primary/15 text-primary-ink flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold">
          {row.displayName.slice(0, 1)}
        </span>
      )}
      <span className="min-w-0">
        <span className="text-default-900 block truncate text-sm font-semibold">
          {row.displayName}
        </span>
        {!row.isCurrentMember && (
          /* คนที่ออกจากร้านไปแล้วแต่ยังมีผลงานในช่วงนี้ — ต้องบอก ไม่ใช่ซ่อนแถว
             (ซ่อนเมื่อไหร่ ผลรวมยอดขายจะไม่ตรงกับการ์ดด้านบนโดยไม่มีคำอธิบาย) */
          <span className="text-default-400 block text-2xs">ไม่ได้อยู่ในร้านแล้ว</span>
        )}
      </span>
    </span>
  )
}

type Props = {
  rows: LeaderboardRow[]
  /** จำนวนเธรดทั้งหมดในช่วงนี้ (ก่อนกรองว่าใครตอบ) — ใช้แยกความหมายของจอว่าง */
  totalConversations: number
  /** จำนวน **แชท** ที่ถูกตอบจากนอกระบบล้วน ๆ — ใช้แยกความหมายของจอว่าง */
  answeredOutsideSystemConversations: number
  /** ตัวเลขเงินถูกตัดออกตั้งแต่ฝั่ง server หรือเปล่า — ใช้ตัดสินว่าจะ render คอลัมน์ไหม */
  canSeeRevenue: boolean
  /** query string ปัจจุบัน — ส่งต่อให้โมดัลเพื่อคงช่วงเวลา/ตัวกรองเดิมไว้ */
  queryString: string
  /** คำนามของ "หนึ่งใบ" ผันตามประเภทกิจการ (ORDER_VOCAB) — ร้านบริการไม่เรียก "คำสั่งซื้อ" */
  orderNoun: string
}

export default function AgentLeaderboard({
  rows,
  totalConversations,
  answeredOutsideSystemConversations,
  canSeeRevenue,
  queryString,
  orderNoun,
}: Props) {
  const router = useRouter()
  /** แถวที่กำลังเปิดโมดัลอยู่ — null = ปิด (เก็บชื่อไว้ด้วยเพื่อโชว์ทันทีระหว่างโหลด) */
  const [openAgent, setOpenAgent] = useState<{ id: string; name: string } | null>(null)
  /* แผงโหลดทับ "พื้นที่ผลลัพธ์" ตอนเปลี่ยนหน้า/เรียงใหม่ — เดียวกับ /customers และ /orders
     ตามที่ user สั่งไว้ 2026-08-07 ("ทุกการ filter หรือ load ข้อมูลใหม่ มี preloading ขึ้นมาทับ") */
  const busy = useListBusy()
  const { run } = busy
  const [sorting, setSorting] = useState<SortingState>([{ id: 'conversations', desc: true }])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })

  /**
   * 🛑 ต้องเป็น `useCallback` ไม่ใช่ฟังก์ชันธรรมดา — มันถูกใช้ใน dep array ของ `useMemo`
   * ที่ประกอบคอลัมน์ ฟังก์ชันที่ประกาศใหม่ทุก render จะทำให้คอลัมน์ถูกสร้างใหม่ทุกครั้ง
   * (identity ไม่เสถียร — คลาสเดียวกับ `docs/conventions/hook-return-identity-in-deps.md`)
   */
  /**
   * ปริมาณงานของคนที่ทำมากที่สุดในตาราง — ใช้เป็นฐานความยาวแถบกรวย
   *
   * 🛑 แถบเคยเข้ารหัส **อัตรา** (มีบิล ÷ ตอบแชท) ซึ่งกลับหัวความหมายบนจอจริง:
   * คนที่ตอบ 525 แชทและเปิดบิล 51 ใบได้แถบสั้นเกือบว่าง (8.6%) ส่วนคนที่มี 1 แชท 1 บิล
   * ได้แถบเต็ม (100%) — user เจอเองบน prod 2026-08-27 พร้อมภาพหน้าจอ
   * ทุกตัวเลขรอบ ๆ แถบเป็น "จำนวน" คนอ่านจึงอ่านแถบว่า "ใครทำเยอะ" ไม่ใช่ "ใครแปลงได้ดี"
   * ⇒ ให้แถบวัด **ปริมาณเทียบกับคนที่ทำมากที่สุด** ส่วนอัตราไปอยู่คอลัมน์ "ปิดการขาย" ซึ่ง
   * เป็นที่ของมันอยู่แล้ว
   */
  const maxReplied = useMemo(
    () => rows.reduce((mx, r) => Math.max(mx, r.repliedConversations), 0),
    [rows],
  )

  const href = useCallback(
    (id: string) => `/reports/agents/${id}${queryString ? `?${queryString}` : ''}`,
    [queryString],
  )

  const columns = useMemo(
    () => [
      columnHelper.accessor('displayName', {
        header: 'แอดมิน',
        cell: ({ row }) => <AgentCell row={row.original} />,
      }),
      columnHelper.accessor('conversations', {
        header: 'แชทที่ดูแล',
        cell: (info) => <span className="tabular-nums">{num(info.getValue())}</span>,
      }),
      // 🛑 เรียงด้วยค่า null ต้องไปท้ายเสมอ ไม่ใช่ถูกอ่านเป็น 0 แล้วขึ้นบนสุดตอนเรียงน้อย→มาก
      // (คนที่ "ยังไม่มีข้อมูล" จะดูเหมือนคนที่ "ตอบเร็วที่สุด" ซึ่งกลับหัวความหมายทั้งคอลัมน์)
      /**
       * 🛑 ต้องแสดง **ทั้งค่าเฉลี่ยและค่ากลาง** — แสดงตัวเดียวคือการเลือกโกหกด้านใดด้านหนึ่ง
       *
       * ข้อมูลจริงบน prod (BT ธัญบุรี 30 วัน): แอดมินคนหนึ่งมีค่าเฉลี่ย 7 ชม. 33 น. แต่ค่ากลาง
       * **18 นาที** — ต่างกัน 25 เท่า เพราะข้อความที่เข้ามาตอนดึกแล้วตอบตอนเช้า ซึ่งเธอคุมไม่ได้
       * (ระบบไม่มีข้อมูลเวลาทำการให้หักช่วงร้านปิด — ดู `agent-performance.ts::median`)
       *
       * ค่ากลางเป็นตัวหลัก (ตัวหนา) เพราะมันคือเลขที่อธิบายพฤติกรรมการทำงานจริงของคนคนนั้น
       * ส่วนค่าเฉลี่ยยังต้องอยู่ เพราะมันคือเลขที่บอกว่า "ลูกค้ารอนานแค่ไหนจริง ๆ"
       *
       * เรียงด้วย **ค่ากลาง** ไม่ใช่ค่าเฉลี่ย — จัดอันดับคนด้วยเลขที่ค่าสุดโต่งลากไปคือสิ่งที่
       * คอลัมน์นี้ถูกแก้เพื่อเลิกทำ (impeccable critique 2026-08-27 · P0)
       */
      columnHelper.accessor((r) => r.firstResponseMedianSec ?? undefined, {
        id: 'firstResponseMedianSec',
        // 🛑 แปลง null → undefined ก่อนส่งให้ตัวเรียง: TanStack ตรึง `undefined` ไว้ท้ายเสมอ
        // ผ่าน `sortUndefined` (ไม่ว่าเรียงขึ้นหรือลง) แต่ `null` จะถูกอ่านเป็นค่าปกติแล้วสลับ
        // ไปอยู่หัวตารางตอนเรียงน้อย→มาก ⇒ คนที่ "ยังไม่มีข้อมูล" จะดูเหมือน "ตอบเร็วที่สุด"
        sortUndefined: 'last',
        header: () => (
          <span className="block">
            ตอบครั้งแรก
            <span className="text-default-400 block text-2xs font-normal">เฉลี่ย / ค่ากลาง</span>
          </span>
        ),
        cell: ({ row }) => (
          <span className="tabular-nums whitespace-nowrap">
            <span className="text-default-500">
              {formatResponseDuration(row.original.firstResponseAvgSec)}
            </span>
            <span className="text-default-300 mx-1">/</span>
            <b>{formatResponseDuration(row.original.firstResponseMedianSec)}</b>
          </span>
        ),
      }),
      /**
       * เหตุผลเดียวกับคอลัมน์ก่อนหน้า + เพิ่ม `responseSampleCount`
       *
       * 🛑 ถ้าไม่บอกจำนวนครั้งที่วัดได้ คนที่ถูกวัด **1 ครั้ง** กับคนที่ถูกวัด **500 ครั้ง**
       * จะแสดงผลเหมือนกันทุกประการ แล้วค่าเฉลี่ยจากตัวอย่างเดียวจะถูกอ่านเป็นอัตราที่เชื่อถือได้
       * (ข้อมูลจริง: มีแอดมินที่มีตัวอย่างแค่ 2 ครั้งอยู่ในตารางเดียวกับคนที่มี 1,205 ครั้ง)
       */
      columnHelper.accessor((r) => r.responseMedianSec ?? undefined, {
        id: 'responseMedianSec',
        // 🛑 แปลง null → undefined ก่อนส่งให้ตัวเรียง: TanStack ตรึง `undefined` ไว้ท้ายเสมอ
        // ผ่าน `sortUndefined` (ไม่ว่าเรียงขึ้นหรือลง) แต่ `null` จะถูกอ่านเป็นค่าปกติแล้วสลับ
        // ไปอยู่หัวตารางตอนเรียงน้อย→มาก ⇒ คนที่ "ยังไม่มีข้อมูล" จะดูเหมือน "ตอบเร็วที่สุด"
        sortUndefined: 'last',
        header: () => (
          <span className="block">
            ตอบเฉลี่ยทั้งบทสนทนา
            <span className="text-default-400 block text-2xs font-normal">เฉลี่ย / ค่ากลาง</span>
          </span>
        ),
        cell: ({ row }) => (
          <span className="tabular-nums whitespace-nowrap">
            <span className="text-default-500">
              {formatResponseDuration(row.original.responseAvgSec)}
            </span>
            <span className="text-default-300 mx-1">/</span>
            <b>{formatResponseDuration(row.original.responseMedianSec)}</b>
            <span className="text-default-400 block text-2xs font-normal">
              {row.original.responseSampleCount > 0
                ? `จาก ${num(row.original.responseSampleCount)} ครั้ง`
                : 'ยังไม่มีตัวอย่าง'}
            </span>
          </span>
        ),
      }),
      /**
       * กรวย "ตอบแชท → เปิดบิล" — เรียงด้วยขั้นแรกของกรวย (จำนวนเธรดที่ตอบเอง)
       *
       * 🛑 ต้องอ่านได้ว่า "ลดหลั่นลง" ในบรรทัดเดียว ไม่ใช่ 3 คอลัมน์แยกที่ผู้ใช้ต้องเอามาลบกันเอง
       * — ตัวเลขที่ต้องคำนวณในหัวคือตัวเลขที่ไม่มีใครอ่าน
       */
      columnHelper.accessor('repliedConversations', {
        header: `ตอบแชท → เปิด${orderNoun}`,
        cell: ({ row }) => {
          const r = row.original
          // ความยาว = สัดส่วนปริมาณงานเทียบคนที่ทำมากที่สุด (ไม่ใช่อัตราแปลง — ดูคอมเมนต์ที่ maxReplied)
          const pct =
            maxReplied > 0 ? Math.round((r.repliedConversations / maxReplied) * 100) : 0
          return (
            <span className="flex min-w-0 flex-col gap-1">
              <span
                className="bg-default-200 h-1.5 w-24 shrink-0 overflow-hidden rounded-full"
                aria-hidden="true">
                <span
                  className="bg-primary block h-full rounded-full"
                  style={{ width: `${Math.max(pct, r.repliedConversations > 0 ? 3 : 0)}%` }}
                />
              </span>
              <span className="text-default-500 text-2xs tabular-nums">
                {num(r.repliedConversations)} ตอบ →{' '}
                <b className="text-default-900">{num(r.conversationsWithOrder)}</b> มี{orderNoun} →{' '}
                <b className="text-default-900">{num(r.conversationsWithClosedOrder)}</b> ปิดได้
              </span>
            </span>
          )
        },
      }),
      columnHelper.accessor('ordersCreated', {
        header: `เปิด${orderNoun}เอง`,
        cell: ({ row }) => {
          const r = row.original
          /**
           * 🛑 คนที่คุยจนลูกค้าตัดสินใจแต่ไม่ได้เป็นคนเปิดบิล จะขึ้น 0 ที่คอลัมน์นี้
           * ถ้าปล่อยเป็นเลข 0 เฉย ๆ จะอ่านว่า "ไม่ได้ทำอะไร" ซึ่งไม่จริง —
           * จึงติดชิปบอกว่ามีบิลออกมาจากแชทของเขากี่ใบ (เคสจริงบน prod: ตอบ 54 ห้อง บิล 4 ใบ เปิดเอง 0)
           */
          if (r.ordersCreated === 0 && r.ordersCreatedByOthers > 0) {
            /**
             * 🛑 เคยเป็น `bg-warning` แล้วขึ้นต้นด้วย `0` — เปลี่ยนแล้ว (critique 2026-08-27 · P3)
             *
             * สีเหลืองคือไวยากรณ์ "เตือนภัย" ของหน้านี้ (โทเคนเดียวกับแถบ "แชทไม่ถูกนับ")
             * ในตารางที่เซลล์อื่นเป็นกลางหมด ชิปเหลืองใบเดียวอ่านว่า *คนนี้คือปัญหา*
             * ทั้งที่สิ่งที่ผิดปกติคือ **ช่องว่างของการยกเครดิต** ไม่ใช่ตัวเขา
             * และขึ้นต้นด้วยเครดิตที่เขาสร้าง ไม่ใช่เลขศูนย์ที่เขาไม่ได้เป็นคนทำให้เกิด
             */
            return (
              <span className="badge bg-info/15 text-info-ink tabular-nums whitespace-nowrap">
                {num(r.ordersCreatedByOthers)} ใบจากแชทของเขา · คนอื่นเปิด
              </span>
            )
          }
          return (
            <span className="tabular-nums">
              <b>{num(r.ordersCreated)}</b>
              {r.ordersCreatedByOthers > 0 && (
                <span className="text-default-400 text-2xs"> / อื่น {num(r.ordersCreatedByOthers)}</span>
              )}
            </span>
          )
        },
      }),
      /**
       * ยุบ 3 คอลัมน์เดิม (ปิดการขาย · อัตราปิดการขาย · เวลาปิดการขาย) เหลือใบเดียว
       *
       * 🛑 `22/518` กับ `4.2%` คือ **ตัวตั้ง/ตัวหาร กับผลหารของกันเอง** — แยกเป็นสองคอลัมน์
       * บังคับให้ผู้จัดการเอาเลขมาหารในหัวเพื่อตรวจว่าตรงกันไหม ซึ่งไม่มีใครทำ
       * และมันกินความกว้างที่ทำให้คอลัมน์ชื่อคนหลุดจอตอนเลื่อนไปดูยอดขาย
       * (impeccable critique 2026-08-27 · P1 — ตารางเดิม 11 คอลัมน์ ไม่มีคอลัมน์ชื่อที่ตรึงไว้)
       */
      columnHelper.accessor((r) => r.conversionRatePct ?? undefined, {
        id: 'conversionRatePct',
        header: 'ปิดการขาย',
        sortUndefined: 'last',
        cell: ({ row }) => (
          <span className="tabular-nums whitespace-nowrap">
            <b>{formatPercent(row.original.conversionRatePct)}</b>
            <span className="text-default-400 mx-1">·</span>
            <span className="text-default-500">
              {num(row.original.convertedConversations)}/{num(row.original.qualifiedConversations)}
            </span>
            <span className="text-default-400 block text-2xs font-normal">
              {row.original.timeToCloseAvgSec === null
                ? 'ยังไม่มีข้อมูลเวลาปิด'
                : `ใช้เวลาเฉลี่ย ${formatResponseDuration(row.original.timeToCloseAvgSec)}`}
            </span>
          </span>
        ),
      }),
      ...(canSeeRevenue
        ? [
            columnHelper.accessor((r) => r.revenue ?? undefined, {
              id: 'revenue',
              header: 'ยอดขาย',
              sortUndefined: 'last',
              cell: (info) => (
                <span className="tabular-nums font-semibold">
                  {info.getValue() === undefined ? '—' : formatBaht(info.getValue() as number)}
                </span>
              ),
            }),
          ]
        : []),
      columnHelper.accessor((r) => r.slaPct ?? undefined, {
        id: 'slaPct',
        header: 'ตอบทันเกณฑ์',
        sortUndefined: 'last',
        cell: ({ row }) => (
          <span className="tabular-nums" title={`${row.original.slaWithin}/${row.original.slaRequired} แชท`}>
            {formatPercent(row.original.slaPct)}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'open',
        header: '',
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() =>
              setOpenAgent({ id: row.original.agentUserId, name: row.original.displayName })
            }
            /* 44px ตามเกณฑ์พื้นที่นิ้วที่ PRODUCT.md ประกาศไว้ — ย่อได้เฉพาะบนเดสก์ท็อป */
            className="text-default-400 hover:text-primary inline-flex size-11 items-center justify-center rounded-full lg:size-8"
            aria-label={`ดูรายละเอียดของ ${row.original.displayName}`}>
            <Icon icon="chevron-right" aria-hidden="true" />
          </button>
        ),
      }),
    ],
    [canSeeRevenue, orderNoun, maxReplied],
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, pagination },
    onSortingChange: (u) => run(() => setSorting(u)),
    onPaginationChange: (u) => run(() => setPagination(u)),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    filterFns: {},
  })

  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const start = rows.length === 0 ? 0 : pageIndex * pageSize + 1
  const end = Math.min(start + pageSize - 1, rows.length)

  return (
    <div className="card relative">
      <ListBusyOverlay busy={busy.busy} label="กำลังคำนวณใหม่..." />
      <div className="card-header">
        <h4 className="card-title">ผลงานรายคน</h4>
        <span className="text-default-400 text-xs">กดที่แถวเพื่อดูรายละเอียด</span>
      </div>
      {rows.length > 0 && (
        /* อธิบายกติกาการนับไว้ตรงที่ผู้ใช้กำลังอ่านตัวเลข ไม่ใช่ในเอกสารที่ไม่มีใครเปิด —
           แชทที่ช่วยกันตอบถูกนับให้ทุกคน ผลรวมคอลัมน์แรกจึงมากกว่าการ์ดด้านบนได้ */
        <p className="border-default-200 text-default-400 text-2xs border-b border-dashed px-4 pb-3">
          แชทที่หลายคนช่วยกันตอบถูกนับให้ทุกคนที่ตอบ ผลรวมคอลัมน์ &quot;ตอบแชท&quot;
          จึงมากกว่าตัวเลขรวมของร้านได้ · คอลัมน์ที่ผูกกับเงินยกให้คนเดียวเสมอ ผลรวมจึงตรงกับการ์ดด้านบนพอดี
        </p>
      )}

      <DataTable
        table={table}
        /* 🛑 `router.push` ไม่ใช่ `window.location.href` — ตัวหลังโหลดเอกสารใหม่ทั้งหน้า
           ขณะที่ chevron ห่างไปไม่กี่บรรทัดเป็น <Link> ที่ทำ client nav ⇒ แถวเดียวกัน
           ทำงานสองแบบตามจุดที่กด (critique 2026-08-27 · P2) หน้าพี่น้องใช้ router.push */
        /* กดแถว = เปิดโมดัล ไม่ย้ายหน้า (user เคาะ 2026-08-27) — ผู้จัดการเทียบคนหลายคน
           ติด ๆ กัน การเด้งออกจากตารางทำให้เสียลำดับการเรียงและหน้าที่กำลังดูอยู่ทุกครั้ง
           route เดิมยังอยู่สำหรับลิงก์ตรง (ปุ่ม "เปิดหน้าเต็ม" ในโมดัล) */
        onRowClick={(row) =>
          setOpenAgent({ id: row.original.agentUserId, name: row.original.displayName })
        }
        emptyMessage={
          /**
           * 🛑 จอว่างมี **2 ความหมายที่ต่างกันสิ้นเชิง** และเดิมเขียนครอบไว้ข้อความเดียว
           *
           * ข้อมูลจริงบน prod 2026-08-27 (BT Premium สาขาพุทธมณฑลสาย 3): 30 วันมี 834 เธรด
           * **ตอบไปแล้ว 830 เธรด** แต่ระบุตัวผู้ตอบไม่ได้เลยสักใบ (ทีมพิมพ์จาก Business Suite)
           * ⇒ ข้อความเดิมที่ว่า "ตัวเลขจะขึ้นเมื่อ...มีคนในร้านตอบ" คือการบอกคนที่ตอบลูกค้า
           * ไปแล้ว 830 ห้องว่าเขาไม่ได้ตอบ ซึ่งไม่จริงและเป็นการโทษผิดคน
           */
          totalConversations > 0 && answeredOutsideSystemConversations > 0 ? (
            <SellerEmptyState
              compact
              icon="user-question"
              title="มีการตอบแชท แต่ระบบไม่รู้ว่าใครเป็นคนตอบ"
              description={`ช่วงนี้ร้านคุณตอบลูกค้าไปแล้ว ${answeredOutsideSystemConversations.toLocaleString('th-TH')} แชท แต่ข้อความถูกพิมพ์จากแอปของแพลตฟอร์มโดยตรง (เช่น Facebook Business Suite) ซึ่งไม่ส่งชื่อผู้พิมพ์กลับมา — ให้ทีมตอบผ่านกล่องข้อความของ Deep แล้วตัวเลขจะขึ้นเองทันที`}
              action={{ label: 'ไปที่กล่องข้อความ', href: '/inbox' }}
            />
          ) : (
            <SellerEmptyState
              compact
              icon="users"
              title="ยังไม่มีผลงานในช่วงนี้"
              /* ห้ามเขียนว่า "ไม่มีข้อมูล" เฉย ๆ — บอกกลไกไปตรง ๆ ว่าตัวเลขมาจากไหน */
              description="ตัวเลขจะขึ้นเมื่อมีลูกค้าทักเข้ามาและมีคนในร้านตอบในช่วงเวลาที่เลือก"
            />
          )
        }
        mobileCard={(row) => {
          const r = row.original
          return (
            /* 🛑 ห้ามใช้ `.card` ที่นี่ — DataTable.tsx:162 เขียนไว้เองว่าตารางอยู่ใน .card panel
               แล้ว การใส่ card ซ้อนได้ขอบสองชั้น = nested cards ซึ่ง DESIGN.md แบนไว้
               (critique 2026-08-27 · P2) ตัวห่อของ DataTable มี divide-y ให้อยู่แล้ว */
            <div className="relative px-4 py-3">
              <div className="flex flex-col gap-3">
                {/* ลิงก์กินทั้งใบเป็นชั้นล่างสุด — แพตเทิร์นเดียวกับ ProductCard.tsx:85
                    🛑 `stretched-link` ไม่ใช่คลาสที่มีอยู่จริงในโปรเจกต์นี้ (เป็นแค่ชื่อที่ใช้เรียก
                    ในคอมเมนต์) ของจริงคือ `absolute inset-0` บนตัว <Link> เอง */}
                <button
                  type="button"
                  onClick={() => setOpenAgent({ id: r.agentUserId, name: r.displayName })}
                  className="active:bg-default-500/10 absolute inset-0 rounded transition-colors"
                  aria-label={`ดูรายละเอียดของ ${r.displayName}`}
                />
                <div className="flex items-center justify-between gap-2">
                  <AgentCell row={r} />
                  <Icon icon="chevron-right" className="text-default-400" aria-hidden="true" />
                </div>
                <dl className="border-default-200 grid grid-cols-2 gap-y-2 border-t border-dashed pt-3 text-sm">
                  <dt className="text-default-500">แชทที่ดูแล</dt>
                  <dd className="text-end tabular-nums">{num(r.conversations)}</dd>
                  {/* มือถือกลับด้าน: ค่ากลางขึ้นเป็นค่าหลัก เฉลี่ยลงบรรทัดรอง — พื้นที่แคบ
                      ต้องเลือกตัวที่อธิบายพฤติกรรมคนได้ก่อน แต่ห้ามตัดอีกตัวทิ้ง (P0) */}
                  <dt className="text-default-500">ตอบครั้งแรก (ค่ากลาง)</dt>
                  <dd className="text-end tabular-nums">
                    <b>{formatResponseDuration(r.firstResponseMedianSec)}</b>
                    <span className="text-default-400 block text-2xs font-normal">
                      เฉลี่ย {formatResponseDuration(r.firstResponseAvgSec)}
                      {r.responseSampleCount > 0 && ` · จาก ${num(r.responseSampleCount)} ครั้ง`}
                    </span>
                  </dd>
                  <dt className="text-default-500">ตอบแชท → เปิด{orderNoun}</dt>
                  <dd className="text-end tabular-nums">
                    {num(r.repliedConversations)} → {num(r.conversationsWithOrder)} →{' '}
                    {num(r.conversationsWithClosedOrder)}
                  </dd>
                  <dt className="text-default-500">เปิด{orderNoun}เอง</dt>
                  <dd className="text-end tabular-nums">
                    {r.ordersCreated === 0 && r.ordersCreatedByOthers > 0 ? (
                      <span className="badge bg-info/15 text-info-ink whitespace-nowrap">
                        {num(r.ordersCreatedByOthers)} ใบจากแชทของเขา · คนอื่นเปิด
                      </span>
                    ) : (
                      num(r.ordersCreated)
                    )}
                  </dd>
                  <dt className="text-default-500">อัตราปิดการขาย</dt>
                  <dd className="text-end tabular-nums">{formatPercent(r.conversionRatePct)}</dd>
                  {canSeeRevenue && (
                    <>
                      <dt className="text-default-500">ยอดขาย</dt>
                      <dd className="text-end font-semibold tabular-nums">
                        {r.revenue === null ? '—' : formatBaht(r.revenue)}
                      </dd>
                    </>
                  )}
                </dl>
              </div>
            </div>
          )
        }}
      />

      <AgentDetailModal
        /* remount ทุกครั้งที่เปลี่ยนคน — ได้ state สะอาดโดยไม่ต้อง setState ใน effect */
        key={openAgent?.id ?? 'closed'}
        agentUserId={openAgent?.id ?? null}
        agentName={openAgent?.name ?? ''}
        queryString={queryString}
        canSeeRevenue={canSeeRevenue}
        orderNoun={orderNoun}
        onClose={() => setOpenAgent(null)}
      />

      {rows.length > pageSize && (
        <div className="card-footer">
          <TablePagination
            totalItems={rows.length}
            start={start}
            end={end}
            itemsName="คน"
            previousPage={table.previousPage}
            canPreviousPage={table.getCanPreviousPage()}
            pageCount={table.getPageCount()}
            pageIndex={pageIndex}
            setPageIndex={table.setPageIndex}
            nextPage={table.nextPage}
            canNextPage={table.getCanNextPage()}
          />
        </div>
      )}
    </div>
  )
}
