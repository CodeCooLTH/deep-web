'use client'

/**
 * AgentDetailModal — รายละเอียดของแอดมินหนึ่งคน แบบโมดัลเกือบเต็มจอ (user เคาะ 2026-08-27)
 *
 * Base (เปลือกโมดัล + ฉากหลัง + ปุ่มปิด):
 *   src/app/(paces)/seller/(dashboard)/products/components/ProductsListing.tsx (โมดัลตัวกรอง)
 *   ซึ่งเป็นแพตเทิร์น "แปลง hs-overlay เป็น controlled div" มาตรฐานของโปรเจกต์
 * Base (การ์ดสถิติ): _shared/PacesStatCard.tsx
 *
 * ── ทำไมเป็นโมดัล ไม่ใช่ย้ายหน้า ────────────────────────────────────────────
 * ผู้จัดการเปรียบเทียบคนหลายคนติด ๆ กัน การเด้งออกจากตารางแล้วต้องกด back กลับมา
 * ทำให้เสียตำแหน่งการเรียง/หน้าที่กำลังดูอยู่ทุกครั้ง
 *
 * 🛑 route `/reports/agents/[agentId]` **ยังอยู่เหมือนเดิม** ไม่ได้ถูกลบ — มันคือทางสำหรับ
 * ลิงก์ตรง/แชร์ให้คนอื่น และเป็นด่านสิทธิ์ฝั่ง server ที่โมดัลไม่ได้มาแทนที่
 * โมดัลดึงข้อมูลจาก API ตัวเดียวกับที่หน้านั้นใช้ ⇒ ตัวเลขสองทางมาจากแหล่งเดียวกันเสมอ
 *
 * 🛑 ล็อก scroll ด้วย `useLockBodyScroll` — โมดัลที่ประกอบเองด้วย React state ไม่ได้ล็อกให้ฟรี
 * แบบที่ Preline ทำให้ (docs/conventions/overlay-scroll-lock.md — พลาดมาแล้วทั้งระบบ 11 ใบ)
 */
import { useEffect, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import PacesStatCard from '../../../_shared/PacesStatCard'
import SellerErrorState from '../../../_shared/SellerErrorState'
import { SellerChartSkeleton, SellerTableSkeleton } from '../../../_shared/SellerCardSkeleton'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'
import { formatBaht, formatNumberNoSymbol } from '@/lib/format-money'
import { formatPercent, formatResponseDuration } from '@/lib/agent-performance'
import AgentTrendChart, { type TrendPoint } from '../[agentId]/components/AgentTrendChart'
import ConversationBreakdownTable from '../[agentId]/components/ConversationBreakdownTable'
import type { BreakdownRow } from './data'

type Metrics = {
  conversations: number
  qualifiedConversations: number
  convertedConversations: number
  conversionRatePct: number | null
  ordersCreated: number
  revenue: number
  firstResponseAvgSec: number | null
  firstResponseMedianSec: number | null
  responseAvgSec: number | null
  responseMedianSec: number | null
  responseSampleCount: number
  slaRequired: number
  slaWithin: number
  slaPct: number | null
  timeToCloseAvgSec: number | null
  repliedConversations: number
  conversationsWithOrder: number
  conversationsWithClosedOrder: number
  ordersCreatedByOthers: number
}

type DetailPayload = {
  agent: { userId: string; displayName: string; avatar: string | null; isCurrentMember: boolean }
  metrics: Metrics
  trend: TrendPoint[]
  sla: { firstResponseSec: number; source: string }
  error?: string
}

type Props = {
  /** null = ปิดอยู่ */
  agentUserId: string | null
  /** ชื่อที่รู้อยู่แล้วจากแถวในตาราง — โชว์ทันทีระหว่างโหลด ไม่ต้องรอ API */
  agentName: string
  queryString: string
  canSeeRevenue: boolean
  orderNoun: string
  onClose: () => void
}

/** เพดานแถวของตารางย่อย — ตรงกับ MAX_LIMIT ของ API route */
const BREAKDOWN_LIMIT = 100

export default function AgentDetailModal({
  agentUserId,
  agentName,
  queryString,
  canSeeRevenue,
  orderNoun,
  onClose,
}: Props) {
  const open = agentUserId !== null
  useLockBodyScroll(open)

  const [detail, setDetail] = useState<DetailPayload | null>(null)
  const [rows, setRows] = useState<BreakdownRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [failed, setFailed] = useState<string | null>(null)

  /* ปิดด้วย Escape — โมดัลที่ปิดได้ทางเดียวคือเมาส์ ใช้งานด้วยคีย์บอร์ดไม่ได้ */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  /**
   * โหลดข้อมูลของคนที่เปิดอยู่
   *
   * 🛑 ทุก `setState` เกิด **หลัง** `await` เสมอ และมีธง `cancelled` กั้น — สองอย่างนี้แก้คนละปัญหา:
   * `await` ทำให้ไม่มี setState แบบ synchronous ในตัว effect (ซึ่งทำให้เกิด cascading render
   * และ eslint จับได้) ส่วน `cancelled` กันการเขียน state หลังโมดัลถูกปิดไปแล้ว/สลับคนแล้ว
   * ซึ่งจะทำให้เห็นข้อมูลของคนก่อนหน้าค้างอยู่ในโมดัลของคนใหม่
   */
  useEffect(() => {
    if (!agentUserId) return
    let cancelled = false
    const qs = queryString ? `?${queryString}` : ''
    const sep = qs ? '&' : '?'

    void (async () => {
      try {
        const [d, b] = await Promise.all([
          fetch(`/api/seller/reports/agents/${encodeURIComponent(agentUserId)}${qs}`),
          fetch(
            `/api/seller/reports/agents/${encodeURIComponent(agentUserId)}/conversations${qs}${sep}limit=${BREAKDOWN_LIMIT}`,
          ),
        ])
        if (cancelled) return

        if (!d.ok) {
          // 4xx/5xx ของโปรเจกต์นี้ตอบ { error } เสมอ — อ่านข้อความจริงมาแสดง ไม่ใช่ข้อความกลาง
          const msg = await d
            .json()
            .then((x: { error?: string }) => x?.error)
            .catch(() => null)
          if (!cancelled) setFailed(msg || 'โหลดรายละเอียดไม่สำเร็จ')
          return
        }

        const payload = (await d.json()) as DetailPayload
        if (cancelled) return
        setDetail(payload)

        if (b.ok) {
          const bd = (await b.json()) as {
            rows: (Omit<BreakdownRow, 'startedAtISO'> & { startedAt: string })[]
            total: number
          }
          if (cancelled) return
          setRows(bd.rows.map((r) => ({ ...r, startedAtISO: r.startedAt })))
          setTotal(bd.total)
        } else if (!cancelled) {
          setRows([])
        }
      } catch {
        if (!cancelled) setFailed('เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [agentUserId, queryString])

  if (!open) return null

  const m = detail?.metrics

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`รายละเอียดการตอบแชทของ ${agentName}`}>
      {/* ฉากหลัง — กดเพื่อปิด · touch-none กันนิ้วลากหน้าหลังบนมือถือ */}
      <button
        type="button"
        aria-label="ปิด"
        onClick={onClose}
        className={'bg-dark/50 absolute inset-0 h-full w-full touch-none backdrop-blur-[2px]' /* HR7 carve-out: ธีมไม่มีโทเคน backdrop-blur — 2px ทำให้รู้ว่าข้างหลังถูกพักไว้ แต่ยังอ่านโครงหน้าออก */}
      />

      {/*
        ขนาด 90% ของจอตามที่ user สั่ง (2026-08-27) — เว้น 10% ไว้โดยตั้งใจเพื่อให้ยังเห็นว่า
        มีหน้าอยู่ข้างหลังและกดออกได้ ไม่ใช่เต็มจอจนกลายเป็นการย้ายหน้า
      */}
      <div className={'card relative flex h-[90vh] w-full max-w-[90rem] flex-col overflow-hidden sm:w-[90vw]' /* HR7 carve-out: ธีมไม่มีโทเคนของ "เกือบเต็มจอ" (หน่วยของธีมเป็น rem คงที่ ยืดตามจอไม่ได้) */}>
        <div className="card-header shrink-0">
          <div className="flex min-w-0 items-center gap-2">
            <h4 className="card-title truncate">{agentName}</h4>
            {detail && !detail.agent.isCurrentMember && (
              <span className="badge bg-warning/15 text-warning-ink shrink-0">
                ไม่ได้อยู่ในร้านแล้ว
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* ทางออกไปหน้าเต็มสำหรับคนที่อยากแชร์ลิงก์ — route เดิมยังอยู่ */}
            <a
              href={`/reports/agents/${agentUserId}${queryString ? `?${queryString}` : ''}`}
              className="btn btn-sm bg-light text-dark hover:bg-light-hover"
              title="เปิดเป็นหน้าเต็ม (แชร์ลิงก์ได้)">
              <Icon icon="external-link" className="text-base" aria-hidden="true" />
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิด"
              className="btn btn-icon text-default-800 hover:bg-default-100 min-h-11 min-w-11">
              <Icon icon="x" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="bg-body-bg grow overflow-y-auto overscroll-contain p-4">
          {failed ? (
            <SellerErrorState title="โหลดรายละเอียดไม่สำเร็จ" message={failed} />
          ) : !m ? (
            <>
              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <SellerChartSkeleton />
              </div>
              <SellerTableSkeleton />
            </>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <PacesStatCard
                  icon="messages"
                  iconClass="bg-primary/15 text-primary-ink"
                  title="แชทที่ดูแล"
                  text={formatNumberNoSymbol(m.conversations)}
                  valueClass="text-default-900"
                  changePercent={null}
                  bulletClass="text-primary"
                  metric="เข้าเกณฑ์ปิดการขาย"
                  metricValue={formatNumberNoSymbol(m.qualifiedConversations)}
                />
                <PacesStatCard
                  icon="clock-bolt"
                  iconClass="bg-info/15 text-info-ink"
                  title="ตอบครั้งแรก (ค่ากลาง)"
                  text={formatResponseDuration(m.firstResponseMedianSec)}
                  valueClass="text-default-900"
                  changePercent={null}
                  bulletClass="text-info"
                  metric="เฉลี่ย"
                  metricValue={formatResponseDuration(m.firstResponseAvgSec)}
                />
                <PacesStatCard
                  icon="shield-check"
                  iconClass="bg-success/15 text-success-ink"
                  title="ตอบทันเกณฑ์"
                  text={formatPercent(m.slaPct)}
                  valueClass="text-default-900"
                  changePercent={null}
                  bulletClass="text-success"
                  metric="ทันเกณฑ์"
                  metricValue={`${formatNumberNoSymbol(m.slaWithin)}/${formatNumberNoSymbol(m.slaRequired)}`}
                />
                <PacesStatCard
                  icon="target-arrow"
                  iconClass="bg-success/15 text-success-ink"
                  title="ปิดการขาย"
                  text={formatPercent(m.conversionRatePct)}
                  valueClass="text-default-900"
                  changePercent={null}
                  bulletClass="text-success"
                  metric={canSeeRevenue ? 'ยอดขาย' : 'ปิดได้'}
                  metricValue={
                    canSeeRevenue
                      ? formatBaht(m.revenue)
                      : formatNumberNoSymbol(m.convertedConversations)
                  }
                />
              </div>

              {/* เส้นทาง "ตอบแชท → เปิดบิล" ของคนนี้ — คำถามที่ผู้จัดการถามบ่อยที่สุด */}
              <div className="card mb-4">
                <div className="card-body flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
                  <span className="text-default-500">ตอบแชท → เปิดบิล</span>
                  <span className="tabular-nums">
                    <b>{formatNumberNoSymbol(m.repliedConversations)}</b> ตอบ
                    <span className="text-default-400 mx-2">→</span>
                    <b>{formatNumberNoSymbol(m.conversationsWithOrder)}</b> มี{orderNoun}
                    <span className="text-default-400 mx-2">→</span>
                    <b>{formatNumberNoSymbol(m.conversationsWithClosedOrder)}</b> ปิดได้
                  </span>
                  <span className="text-default-500 ms-auto">
                    เปิดเอง <b className="text-default-900">{formatNumberNoSymbol(m.ordersCreated)}</b>
                    {m.ordersCreatedByOthers > 0 && (
                      <>
                        <span className="text-default-400 mx-2">·</span>
                        คนอื่นเปิดจากแชทของเขา{' '}
                        <b className="text-default-900">
                          {formatNumberNoSymbol(m.ordersCreatedByOthers)}
                        </b>
                      </>
                    )}
                  </span>
                </div>
              </div>

              <div className="mb-4">
                <AgentTrendChart points={detail.trend} canSeeRevenue={canSeeRevenue} />
              </div>

              {rows === null ? (
                <SellerTableSkeleton />
              ) : (
                <>
                  <ConversationBreakdownTable rows={rows} canSeeRevenue={canSeeRevenue} />
                  {total > rows.length && (
                    /* ห้ามตัดเงียบ — ผู้ใช้ต้องรู้ว่ากำลังดูไม่ครบ */
                    <p className="text-default-500 mt-3 text-center text-sm">
                      แสดง {formatNumberNoSymbol(rows.length)} จาก {formatNumberNoSymbol(total)}{' '}
                      บทสนทนา — ย่อช่วงเวลาลงเพื่อดูให้ครบ
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
