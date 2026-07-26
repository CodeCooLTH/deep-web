'use client'

/**
 * ShopVideosClient — เลือกคลิปที่จะโชว์บนหน้าร้านสาธารณะ (2026-07-26)
 *
 * ร้านไม่ได้วาง URL เอง แต่เลือกจากคลิปของบัญชีที่เชื่อมไว้ ซึ่งการันตีความเป็นเจ้าของ
 * (ฝั่ง API ตรวจซ้ำอีกชั้นเสมอ — UI ที่ให้เลือกอย่างเดียวไม่ใช่การป้องกัน)
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/channels/ChannelsClient.tsx
 *   — โครง card + card-header, สถานะโหลด, pacesToast, SellerEmptyState
 * Base: src/app/(paces)/seller/(dashboard)/products/components/ProductImagesCardV2.tsx
 *   — grid รูปแบบเลือกได้ + เครื่องหมายบอกว่าถูกเลือก
 *
 * Toast: pacesToast เท่านั้น (Hard Rule 9 — ฝั่ง (paces) ห้ามใช้ toast ของฝั่ง buyer)
 * Paces primitive เท่านั้น — ห้าม arbitrary value (Hard Rule 7)
 */

import { useCallback, useEffect, useState } from 'react'
import { Icon } from '@iconify/react'

import { pacesToast } from '@/lib/paces-toast'
import SellerEmptyState from '../../_shared/SellerEmptyState'

interface AvailableVideo {
  provider: string
  videoId: string
  caption: string | null
  thumbnailUrl: string | null
  permalink: string
  accountName: string | null
  likeCount: number | null
  commentCount: number | null
  viewCount: number | null
}

/** ป้ายบอกแหล่งที่มาบนการ์ดที่ให้เลือก */
// simple-icons = โลโก้แบรนด์จริง ไม่ใช่ไอคอนเส้นที่วาดเลียนแบบ
// ต้องใส่ prefix เสมอเพราะไฟล์นี้ใช้ @iconify/react ตรง ๆ ไม่ใช่ Icon wrapper ที่เติม tabler: ให้
// (ชื่อไม่มี prefix จะไม่ render อะไรเลยและไม่มี error — เจอจริงตอน user ทักว่าไอคอนหาย)
const SOURCE: Record<string, { icon: string; label: string; className: string }> = {
  FACEBOOK: { icon: 'simple-icons:facebook', label: 'Facebook', className: 'bg-info text-white' },
  INSTAGRAM: { icon: 'simple-icons:instagram', label: 'Instagram', className: 'bg-danger text-white' },
}

/** key ของช่องทาง = provider + ชื่อบัญชี — ร้านเดียวมีได้หลายเพจ จึงแยกทีละเพจ ไม่ใช่ทีละแพลตฟอร์ม */
function sourceKeyOf(v?: AvailableVideo): string {
  return v ? `${v.provider}|${v.accountName ?? ''}` : ''
}

/** ย่อเลขให้อ่านง่ายบนพื้นที่แคบ */
function compact(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`
  return `${(n / 1_000_000).toFixed(1)}M`
}

interface SelectedVideo {
  id: string
  provider: string
  videoId: string
  caption: string | null
  thumbnailUrl: string | null
  sortOrder: number
}

export default function ShopVideosClient() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [available, setAvailable] = useState<AvailableVideo[]>([])
  // key = PROVIDER:videoId — id คนละแพลตฟอร์มชนกันได้ในทางทฤษฎี
  const [chosen, setChosen] = useState<string[]>([])
  const [max, setMax] = useState(6)
  // แท็บช่องทางที่กำลังดู — '' = ยังไม่เลือก (ตั้งเป็นช่องทางแรกหลังโหลด)
  const [activeSource, setActiveSource] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/shops/current/videos', { cache: 'no-store' })
      if (!res.ok) {
        pacesToast.error('โหลดรายการคลิปไม่สำเร็จ')
        return
      }
      const data = (await res.json()) as {
        selected: SelectedVideo[]
        available: AvailableVideo[]
        partial?: boolean
        max: number
      }
      // รายการอาจไม่ครบเพราะถามแพลตฟอร์มไม่สำเร็จ ต้องบอกร้าน ไม่ปล่อยให้เข้าใจว่าคลิปหาย
      if (data.partial) {
        pacesToast.warning('บางช่องทางดึงคลิปไม่สำเร็จ รายการที่เห็นอาจไม่ครบ')
      }
      setAvailable(data.available)
      setMax(data.max)
      setActiveSource((prev) => prev || sourceKeyOf(data.available[0]) || '')

      // ติ๊กไว้ล่วงหน้าเฉพาะคลิปที่ยังอยู่ในบัญชีจริง ณ ตอนนี้
      //
      // ถ้าเอาของที่บันทึกไว้มาติ๊กดื้อ ๆ คลิปที่ร้านลบไปจากแพลตฟอร์มแล้ว (หรือแถวเก่าที่บันทึก
      // ด้วยโค้ดรุ่นก่อนแก้บั๊ก) จะติดไปกับ payload ทุกครั้งที่กดบันทึก แล้วโดนปฏิเสธทั้งชุด
      // ทำให้ร้านบันทึกอะไรไม่ได้เลยและไม่รู้ว่าเพราะอะไร (เจอจริง — user รายงานสองรอบ)
      const availableKeys = new Set(data.available.map((v) => `${v.provider}:${v.videoId}`))
      const saved = [...data.selected]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => `${s.provider}:${s.videoId}`)
      const stillValid = saved.filter((k) => availableKeys.has(k))
      setChosen(stillValid)

      // ไม่เตือนเมื่อดึงมาไม่ครบ เพราะที่หายอาจแค่ยังไม่ได้โหลด ไม่ใช่ถูกลบจริง
      if (!data.partial && stillValid.length < saved.length) {
        pacesToast.warning(
          `มี ${saved.length - stillValid.length} คลิปที่ไม่พบในบัญชีแล้ว (อาจถูกลบไป) จึงเอาออกจากรายการที่เลือกไว้`,
        )
      }
    } catch {
      pacesToast.error('เกิดข้อผิดพลาดขณะโหลด')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // ลำดับที่กดเลือกคือลำดับที่จะแสดงบนหน้าร้าน — ผู้ใช้เห็นเลขกำกับจึงเดาได้ว่าจะออกมาเรียงยังไง
  const toggle = (videoId: string) => {
    setChosen((prev) => {
      if (prev.includes(videoId)) return prev.filter((v) => v !== videoId)
      if (prev.length >= max) {
        pacesToast.warning(`เลือกได้สูงสุด ${max} คลิป`)
        return prev
      }
      return [...prev, videoId]
    })
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/shops/current/videos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: chosen.map((k) => {
            const [provider, ...rest] = k.split(':')
            return { provider, videoId: rest.join(':') }
          }),
        }),
      })
      if (res.ok) {
        pacesToast.success('บันทึกคลิปที่จะแสดงแล้ว')
        return
      }
      const data = (await res.json().catch(() => null)) as { error?: string; code?: string } | null
      // แยกข้อความ: ตรวจไม่สำเร็จ = ลองใหม่ได้ / ไม่ใช่เจ้าของ = ต้องเลือกใหม่
      if (data?.code === 'VERIFY_UNAVAILABLE') {
        pacesToast.warning(data.error ?? 'ตรวจสอบไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      pacesToast.error(data?.error ?? 'บันทึกไม่สำเร็จ')
    } catch {
      pacesToast.error('เกิดข้อผิดพลาดขณะบันทึก')
    } finally {
      setSaving(false)
    }
  }

  // จัดกลุ่มตามช่องทาง เรียงตามจำนวนคลิปมาก→น้อย ให้ช่องที่มีของเยอะอยู่แท็บแรก
  const sources = Array.from(
    available.reduce((acc, v) => {
      const key = sourceKeyOf(v)
      const cur = acc.get(key)
      if (cur) cur.count += 1
      else
        acc.set(key, {
          key,
          provider: v.provider,
          label: v.accountName ?? SOURCE[v.provider]?.label ?? v.provider,
          count: 1,
        })
      return acc
    }, new Map<string, { key: string; provider: string; label: string; count: number }>()),
  )
    .map(([, v]) => v)
    .sort((a, b) => b.count - a.count)

  const visible = available.filter((v) => sourceKeyOf(v) === activeSource)

  if (loading) {
    return (
      <div className="card">
        <div className="card-body flex items-center gap-2 text-default-500">
          <Icon icon="tabler:loader-2" className="animate-spin text-base" />
          กำลังโหลดคลิปจากบัญชีที่เชื่อมไว้...
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">คลิปที่แสดงบนหน้าร้าน</h4>
        <p className="text-default-500 mt-1 text-sm">
          เลือกได้สูงสุด {max} คลิป จะแสดงตามลำดับที่เลือก
        </p>
      </div>

      <div className="card-body">
        {available.length === 0 ? (
          <SellerEmptyState
            icon="video"
            title="ยังไม่มีคลิปให้เลือก"
            description="คลิปจะดึงมาจากเพจ Facebook และบัญชี Instagram ที่เชื่อมไว้กับร้าน หากยังไม่ได้เชื่อม ให้ไปเชื่อมที่หน้าช่องทางแชทก่อน"
            action={{ label: 'ไปหน้าช่องทางแชท', href: '/settings/channels' }}
            compact
          />
        ) : (
          <>
            {/* แท็บช่องทาง — 17 คลิปจากหลายเพจปนกันในกริดเดียวหายาก (user ทัก 2026-07-26)
                Base: src/app/(paces)/seller/(dashboard)/dashboard/components/SalesReport.tsx (nav tabs)
                ใช้ class ของ Paces แต่คุม active ด้วย React ไม่ใช่ data-hs-tab ของ Preline
                เพราะหน้านี้ re-render ทุกครั้งที่ติ๊กเลือก ซึ่งเป็นเคสที่ Preline เคยพังในโปรเจกต์นี้ */}
            <nav className="mb-base flex gap-x-1 overflow-x-auto" aria-label="ช่องทาง" role="tablist">
              {sources.map((src) => {
                const on = src.key === activeSource
                const picked = chosen.filter((k) => k.startsWith(`${src.provider}:`)).length
                return (
                  <button
                    key={src.key}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setActiveSource(src.key)}
                    className={`inline-flex items-center gap-2 whitespace-nowrap border-b px-4 py-3 text-sm focus:outline-hidden ${
                      on
                        ? 'border-primary text-primary font-semibold'
                        : 'text-default-600 hover:text-primary border-transparent'
                    }`}
                  >
                    <span className={`flex size-4 items-center justify-center rounded-full ${SOURCE[src.provider]?.className ?? 'bg-default-200'}`}>
                      <Icon icon={SOURCE[src.provider]?.icon ?? 'tabler:video'} className="text-xs" />
                    </span>
                    <span className="max-w-40 truncate">{src.label}</span>
                    <span className="text-default-400">{src.count}</span>
                    {picked > 0 && <span className="badge bg-primary/15 text-primary">{picked}</span>}
                  </button>
                )
              })}
            </nav>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
              {visible.map((v) => {
                const key = `${v.provider}:${v.videoId}`
                const order = chosen.indexOf(key)
                const picked = order >= 0
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggle(key)}
                    aria-pressed={picked}
                    className={`border-default-200 relative overflow-hidden rounded-lg border text-start ${
                      picked ? 'border-primary' : ''
                    }`}
                  >
                    <span className="bg-default-100 flex aspect-square items-center justify-center">
                      {v.thumbnailUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element -- รูปจาก CDN ของ Instagram */
                        <img src={v.thumbnailUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <Icon icon="tabler:video" className="text-default-400 text-2xl" />
                      )}
                    </span>

                    {picked && (
                      <span className="bg-primary absolute end-2 top-2 flex size-6 items-center justify-center rounded-full text-white">
                        {order + 1}
                      </span>
                    )}

                    <span className="block p-2">
                      {/* ชื่อคลิปอยู่บนสุด ตัวใหญ่ สีเข้ม — เป็นสิ่งที่ร้านใช้แยกว่าคลิปไหนเป็นคลิปไหน
                          จริง ๆ (user ทัก) ส่วนชื่อช่องทางกับยอดเป็นข้อมูลประกอบ ตัวเล็กลงได้ */}
                      {v.caption && (
                        <span className="text-default-900 mb-1.5 line-clamp-2 text-sm font-semibold">
                          {v.caption}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <span className={`flex size-4 items-center justify-center rounded-full ${SOURCE[v.provider]?.className ?? 'bg-default-200'}`}>
                          <Icon icon={SOURCE[v.provider]?.icon ?? 'tabler:video'} className="text-xs" />
                        </span>
                        <span className="text-default-500 truncate text-xs">{v.accountName ?? SOURCE[v.provider]?.label}</span>
                      </span>
                      {(v.viewCount != null || v.likeCount != null) && (
                        <span className="text-default-500 mt-1 flex items-center gap-2 text-xs">
                          {v.viewCount != null && (
                            <span className="flex items-center gap-1">
                              <Icon icon="tabler:player-play-filled" className="text-sm" />
                              {compact(v.viewCount)}
                            </span>
                          )}
                          {v.likeCount != null && (
                            <span className="flex items-center gap-1">
                              <Icon icon="tabler:heart-filled" className="text-sm" />
                              {compact(v.likeCount)}
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="mt-base flex items-center justify-between gap-3">
              <span className="text-default-500 text-sm">
                เลือกแล้ว {chosen.length} จาก {max}
              </span>
              <button
                type="button"
                className="btn bg-primary text-white hover:bg-primary-hover disabled:opacity-50"
                onClick={save}
                disabled={saving}
              >
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
