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
 * feature 00084 §4.8 — แถว `flash_pod` = หลักฐานการส่งจาก Flash (ผู้เซ็น/เวลา/พิกัด/รูป) ฝั่งร้านเท่านั้น
 *
 * Base: การ์ด `.card` + `.card-header` ของ Paces (โครงเดียวกับ ShippingCard ข้าง ๆ)
 * Base (POD): theme/paces/Admin/TS/src/app/(admin)/pages/gallery/components/Gallery.tsx
 *   → รูปย่อ+lightbox ผ่าน PodPhotoGallery (โครงจาก reviews/components/ReviewImageGallery.tsx)
 */

import { useCallback, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { formatDateTime } from '@/lib/format-date'
import { pacesToast } from '@/lib/paces-toast'
import { podCopyLines, podMapUrl, podTimeIso, type PodView } from '@/lib/shipping/orders-list'
import PodPhotoGallery, { type PodPhoto } from './PodPhotoGallery'

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
  /** มีเฉพาะแถว flash_pod (API.md §4.21) */
  pod?: PodView | null
}

/** รูปทั้งหมดของ POD: ลายเซ็น (podUrl) ก่อน ตามด้วยรูปหน้างาน */
const podPhotos = (pod: PodView): PodPhoto[] => [
  ...(pod.podUrl ? [{ url: pod.podUrl, label: 'ลายเซ็นผู้รับ' }] : []),
  ...pod.photos.map((url, i) => ({ url, label: `รูปหลักฐานที่ ${i + 1}` })),
]

/** แถวข้อมูลของ POD — ป้ายซ้าย/ค่าขวา เส้นประคั่น (โครงเดียวกับ StatRow ของ ShipmentStatusView) */
const PodRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="border-default-200 flex gap-3 border-b border-dashed py-1.5 text-xs last:border-b-0">
    <span className="text-default-600 w-28 shrink-0">{label}</span>
    <span className="text-default-900 min-w-0 break-words">{children}</span>
  </div>
)

/** เนื้อ POD — ช่องไม่มีค่าซ่อนทั้งแถว ไม่แสดงช่องว่าง */
function PodBody({ pod }: { pod: PodView }) {
  const at = podTimeIso(pod.deliveredAt)
  const map = podMapUrl(pod.lat, pod.lng)
  const photos = podPhotos(pod)
  return (
    <div className="px-3 py-2">
      {pod.signer && (
        <PodRow label="ผู้เซ็นรับ">
          {pod.signer}
          {pod.signerTypeText && ` (${pod.signerTypeText})`}
        </PodRow>
      )}
      {at && <PodRow label="ส่งถึงเมื่อ">{formatDateTime(at)}</PodRow>}
      {map && (
        <PodRow label="ตำแหน่งพนักงานตอนส่ง">
          <span className="tabular-nums">
            {pod.lat}, {pod.lng}
          </span>
          <a
            href={map}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-ink mt-1 flex min-h-11 items-center gap-1 text-xs underline"
          >
            <Icon icon="map-pin" className="size-4" aria-hidden="true" />
            ดูบนแผนที่
          </a>
        </PodRow>
      )}
      {photos.length > 0 && (
        <PodRow label="รูป">
          <PodPhotoGallery photos={photos} />
        </PodRow>
      )}
    </div>
  )
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
        if (r.pod && !r.error) {
          return [`[${r.reasonText}] บันทึกเมื่อ ${formatDateTime(r.capturedAt)}`, ...podCopyLines(r.pod, formatDateTime)].join('\n')
        }
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
        <button type="button" className="btn btn-sm bg-light text-default-700 shrink-0 hover:bg-light-hover" onClick={toggle}>
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
                {rows.some((r) => !r.pod)
                  ? 'บันทึกที่ระบบเก็บไว้อัตโนมัติจากขนส่ง ณ เวลาที่พัสดุเปลี่ยนเป็นสถานะมีปัญหา ใช้อ้างอิงเมื่อมีข้อโต้แย้ง'
                  : 'บันทึกที่ระบบเก็บไว้อัตโนมัติจากขนส่ง ใช้อ้างอิงเมื่อมีข้อโต้แย้ง'}
              </p>

              {rows.map((r) => (
                <div key={r.id} className="border-default-200 mb-3 rounded-lg border last:mb-0">
                  <div className="border-default-200 flex flex-wrap items-center gap-2 border-b border-dashed px-3 py-2">
                    {/* POD = info (หลักฐานที่บันทึกไว้ ไม่ใช่สถานะยืนยันความเชื่อใจ จึงไม่ใช้เขียว) */}
                    <span className={`badge text-2xs ${r.pod ? 'bg-info/15 text-info-ink' : 'bg-warning/15 text-warning-ink'}`}>
                      {r.reasonText}
                    </span>
                    <span className="text-default-600 text-2xs">
                      บันทึกเมื่อ {formatDateTime(r.capturedAt)}
                    </span>
                    {!r.pod && <span className="text-default-600 text-2xs">· {r.traceCount} เหตุการณ์</span>}
                  </div>

                  {r.error ? (
                    <p className="text-danger-ink mb-0 px-3 py-2 text-xs">
                      {r.pod || r.reason === 'flash_pod'
                        ? `ดึงหลักฐานการส่งจาก Flash ไม่สำเร็จ (${r.error}) ระบบจะลองใหม่ในรอบเช็คสถานะถัดไป`
                        : `ดึงข้อมูลจากขนส่งไม่สำเร็จ (${r.error}) — แถวนี้บันทึกไว้เพื่อให้รู้ว่า ระบบพยายามแล้ว ไม่ใช่ไม่เคยพยายาม`}
                    </p>
                  ) : r.pod ? (
                    <PodBody pod={r.pod} />
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

              <button type="button" className="btn btn-sm bg-light text-default-700 hover:bg-light-hover" onClick={copyAll}>
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
