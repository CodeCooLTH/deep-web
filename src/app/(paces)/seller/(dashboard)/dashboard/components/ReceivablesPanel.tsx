'use client'

/**
 * ReceivablesPanel — "ต้องตามเก็บ" ในแท็บยอดเก็บเงินของชีตการเงินร้าน (feature 00067 FR-FIN-13)
 *
 * เดิมรายการนี้มีเฉพาะหน้า /sales ซึ่งแถบล่างของแอปไม่มีทางไปถึง — ผู้ขายที่ใช้แอปจริงไม่เคยเห็น
 * (user สั่งยกขึ้นชีต 2026-10-01) · ตัวรายการใช้ ReceivableList ตัวเดียวกับ /sales (variant="plain")
 *
 * โครงดึงข้อมูลเดียวกับ FinancePanels — async ใน effect + AbortController + ปุ่มลองใหม่
 * 403 (พนักงานไม่มีสิทธิ์ดูการเงิน) / 404 (ไม่ใช่ร้านบริการ) = ไม่ render อะไรเลย ไม่ใช่ขึ้น error
 */
import { useEffect, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import ReceivableList from '../../sales/components/ReceivableList'
import type { ReceivableItem, ReceivableSummary } from '@/services/receivable.service'
import { RECEIVABLE_BASIS_NOTE } from '@/lib/finance-tabs'

type Payload = { summary: ReceivableSummary; items: ReceivableItem[]; nextCursor: string | null }

type Props = {
  /** ช่วงเดียวกับที่ชีตแสดงอยู่ — "YYYY-MM-DD" */
  start: string
  end: string
}

export default function ReceivablesPanel({ start, end }: Props) {
  const [data, setData] = useState<Payload | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed' | 'hidden'>('loading')
  const [retry, setRetry] = useState(0)
  const rangeQuery = new URLSearchParams({ range: 'custom', start, end }).toString()

  useEffect(() => {
    const controller = new AbortController()
    const run = async () => {
      setState('loading')
      try {
        const res = await fetch(`/api/finance/receivables?${rangeQuery}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (res.status === 403 || res.status === 404) {
          setState('hidden')
          return
        }
        if (!res.ok) throw new Error(String(res.status))
        setData((await res.json()) as Payload)
        setState('ready')
      } catch (e) {
        if ((e as Error)?.name !== 'AbortError') setState('failed')
      }
    }
    void run()
    return () => controller.abort()
  }, [rangeQuery, retry])

  if (state === 'hidden') return null

  if (state === 'loading') {
    return (
      <div className="border-default-200 mt-5 flex min-h-24 items-center justify-center border-t">
        <Icon icon="loader-2" className="text-default-400 size-5 animate-spin" aria-hidden="true" />
        <span className="sr-only">กำลังโหลดรายการที่ต้องตามเก็บ</span>
      </div>
    )
  }

  if (state === 'failed' || !data) {
    return (
      <div className="border-default-200 mt-5 border-t py-6 text-center">
        <p className="text-default-700 mb-3 text-sm">โหลดรายการที่ต้องตามเก็บไม่สำเร็จ</p>
        <button type="button" onClick={() => setRetry((v) => v + 1)} className="btn bg-light text-dark min-h-11">
          ลองใหม่
        </button>
      </div>
    )
  }

  return (
    <ReceivableList
      // key = ช่วงเวลา — เปลี่ยนเดือนแล้วรายการ/cursor ต้องเริ่มใหม่ ไม่ใช่ต่อท้ายของเดือนก่อน
      key={rangeQuery}
      variant="plain"
      summary={data.summary}
      initialItems={data.items}
      initialCursor={data.nextCursor}
      rangeQuery={rangeQuery}
      basisNote={RECEIVABLE_BASIS_NOTE}
    />
  )
}
