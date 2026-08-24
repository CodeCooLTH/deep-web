'use client'

/**
 * ShipmentEvidencePanel — หลักฐานจากขนส่งสำหรับกรณีพิพาท (feature 00055 · BRD §6)
 *
 * 🛑 ขึ้นเฉพาะออเดอร์ที่ **เคยมีปัญหา/ตีกลับ** — ผู้เรียกตัดสินจากจำนวนแถวที่ server นับมาให้
 * ออเดอร์ปกติต้องไม่เห็นการ์ดนี้เลย ไม่ใช่เห็นการ์ดเปล่า (ค่าตั้งต้นของระบบคือเงียบ)
 *
 * โหลดรายละเอียดตอนกางเท่านั้น — ร้านเปิดหน้าออเดอร์วันละหลายสิบใบ การดึงรายการเดินทาง
 * ทุกใบตั้งแต่ paint แรกคือค่าใช้จ่ายที่แทบไม่มีใครได้ใช้ (ข้อพิพาทเป็นเหตุการณ์หายาก)
 *
 * ถ้อยคำเป็นกลางตาม BR-BR-09 — เล่าว่า "ขนส่งบันทึกอะไรไว้" ไม่ตัดสินว่าใครผิด
 *
 * Base: การ์ด `.card` + `.card-header` ของ Paces (โครงเดียวกับ ShippingCard ข้าง ๆ)
 */

import { useCallback, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { formatDateTime } from '@/lib/format-date'
import { pacesToast } from '@/lib/paces-toast'

type EvidenceTrace = {
  status: string | null
  statusText: string | null
  statusDesc: string | null
  location: string | null
  occurredAt: string | null
}

type EvidenceRow = {
  id: string
  reason: string
  reasonText: string
  capturedAt: string
  traceCount: number
  error: string | null
  traces: EvidenceTrace[]
}

export default function ShipmentEvidencePanel({
  orderToken,
  count,
}: {
  orderToken: string
  /** จำนวนแถวหลักฐานที่ server นับมาให้ — 0 = ไม่ render อะไรเลย */
  count: number
}) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<EvidenceRow[] | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')

  const load = useCallback(async () => {
    if (rows || state === 'loading') return
    setState('loading')
    try {
      const res = await fetch(`/api/orders/${orderToken}/shipment-evidence`, { cache: 'no-store' })
      if (!res.ok) throw new Error('failed')
      const data = (await res.json()) as { evidence?: EvidenceRow[] }
      setRows(data.evidence ?? [])
      setState('idle')
    } catch {
      setState('error')
    }
  }, [orderToken, rows, state])

  if (count <= 0) return null

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) void load()
  }

  /** ข้อความล้วนสำหรับแนบไปกับเรื่องร้องเรียน — คัดลอกทีเดียวได้ทั้งชุด */
  const copyAll = async () => {
    if (!rows) return
    const text = rows
      .map((r) => {
        const head = `[${r.reasonText}] บันทึกเมื่อ ${formatDateTime(r.capturedAt)} — ${r.traceCount} เหตุการณ์`
        const body = r.traces
          .map(
            (t) =>
              `  ${t.occurredAt ? formatDateTime(t.occurredAt) : 'ไม่ระบุเวลา'} · ${
                t.statusText ?? t.status ?? '—'
              }${t.location ? ` · ${t.location}` : ''}${t.statusDesc ? ` · ${t.statusDesc}` : ''}`,
          )
          .join('\n')
        return r.error ? `${head}\n  ดึงข้อมูลไม่สำเร็จ: ${r.error}` : `${head}\n${body}`
      })
      .join('\n\n')
    try {
      await navigator.clipboard.writeText(text)
      pacesToast.success('คัดลอกหลักฐานแล้ว')
    } catch {
      // clipboard ต้องการ https — บอกทางออกที่ทำได้จริง ไม่ใช่ "ลองใหม่"
      pacesToast.error('คัดลอกไม่สำเร็จ — ลากคลุมข้อความแล้วคัดลอกเองได้')
    }
  }

  return (
    <div className="card">
      <div className="card-header flex-nowrap items-center justify-between gap-2">
        <h5 className="card-title flex min-w-0 items-center gap-1.5">
          <Icon icon="shield-check" className="text-default-600 size-4 shrink-0" />
          <span className="truncate">หลักฐานจากขนส่ง</span>
        </h5>
        <button type="button" className="btn btn-sm btn-light shrink-0" onClick={toggle}>
          {open ? 'ซ่อน' : `ดู ${count} ชุด`}
        </button>
      </div>

      {open && (
        <div className="card-body">
          {state === 'loading' && (
            <p className="text-default-700 mb-0 flex items-center gap-2 text-sm">
              <Icon icon="loader-2" className="animate-spin text-base" aria-hidden="true" />
              กำลังโหลดหลักฐาน…
            </p>
          )}

          {state === 'error' && (
            <p className="text-default-700 mb-0 text-sm">
              โหลดหลักฐานไม่สำเร็จ — ปิดแล้วกดดูใหม่อีกครั้ง
            </p>
          )}

          {state === 'idle' && rows && (
            <>
              {/* บอกให้ชัดว่านี่คือ "บันทึกของขนส่ง" ไม่ใช่คำตัดสินของเรา (BR-BR-09) */}
              <p className="text-default-600 mb-3 text-xs">
                บันทึกที่ระบบเก็บไว้อัตโนมัติจากขนส่ง ณ เวลาที่พัสดุเปลี่ยนเป็นสถานะมีปัญหา
                ใช้อ้างอิงเมื่อมีข้อโต้แย้ง
              </p>

              {rows.map((r) => (
                <div key={r.id} className="border-default-200 mb-3 rounded-lg border last:mb-0">
                  <div className="border-default-200 flex flex-wrap items-center gap-2 border-b border-dashed px-3 py-2">
                    <span className="badge bg-warning/15 text-warning-ink text-2xs">
                      {r.reasonText}
                    </span>
                    <span className="text-default-600 text-2xs">
                      บันทึกเมื่อ {formatDateTime(r.capturedAt)}
                    </span>
                    <span className="text-default-600 text-2xs">· {r.traceCount} เหตุการณ์</span>
                  </div>

                  {r.error ? (
                    <p className="text-danger-ink mb-0 px-3 py-2 text-xs">
                      ดึงข้อมูลจากขนส่งไม่สำเร็จ ({r.error}) — แถวนี้บันทึกไว้เพื่อให้รู้ว่า
                      ระบบพยายามแล้ว ไม่ใช่ไม่เคยพยายาม
                    </p>
                  ) : r.traces.length === 0 ? (
                    /* 0 เหตุการณ์เป็นหลักฐานในตัวมันเอง ไม่ใช่ "โหลดไม่ขึ้น" — ต้องพูดตรง ๆ */
                    <p className="text-default-700 mb-0 px-3 py-2 text-xs">
                      ขนส่งไม่มีบันทึกการเดินทางของพัสดุใบนี้เลย
                    </p>
                  ) : (
                    <ul className="mb-0 list-none space-y-2 px-3 py-2 ps-3">
                      {r.traces.map((t, i) => (
                        <li key={i} className="flex gap-2 text-xs">
                          <span className="text-default-500 shrink-0 tabular-nums">
                            {t.occurredAt ? formatDateTime(t.occurredAt) : '—'}
                          </span>
                          <span className="min-w-0">
                            <span className="text-default-900 font-medium">
                              {t.statusText ?? t.status ?? '—'}
                            </span>
                            {t.location && (
                              <span className="text-default-600"> · {t.location}</span>
                            )}
                            {t.statusDesc && (
                              <span className="text-default-600 block">{t.statusDesc}</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}

              <button type="button" className="btn btn-sm btn-light" onClick={copyAll}>
                <Icon icon="copy" className="size-4" aria-hidden="true" />
                คัดลอกทั้งหมด
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
