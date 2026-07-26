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
  videoId: string
  caption: string | null
  thumbnailUrl: string | null
  permalink: string
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
  const [chosen, setChosen] = useState<string[]>([])
  const [max, setMax] = useState(6)

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
        max: number
      }
      setAvailable(data.available)
      setMax(data.max)
      // เรียงตาม sortOrder ที่บันทึกไว้ ไม่ใช่ลำดับที่ API คืนมา
      setChosen([...data.selected].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.videoId))
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
          items: chosen.map((videoId) => ({ provider: 'INSTAGRAM', videoId })),
        }),
      })
      if (res.ok) {
        pacesToast.success('บันทึกคลิปที่จะแสดงแล้ว')
        return
      }
      const data = (await res.json().catch(() => null)) as { error?: string; code?: string } | null
      pacesToast.error(data?.error ?? 'บันทึกไม่สำเร็จ')
    } catch {
      pacesToast.error('เกิดข้อผิดพลาดขณะบันทึก')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="card">
        <div className="card-body flex items-center gap-2 text-default-500">
          <Icon icon="loader-2" className="animate-spin text-base" />
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
            icon="brand-instagram"
            title="ยังไม่มีคลิปให้เลือก"
            description="คลิปจะดึงมาจากบัญชี Instagram ที่เชื่อมไว้กับร้าน หากยังไม่ได้เชื่อม ให้ไปเชื่อมที่หน้าช่องทางแชทก่อน"
            action={{ label: 'ไปหน้าช่องทางแชท', href: '/settings/channels' }}
            compact
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {available.map((v) => {
                const order = chosen.indexOf(v.videoId)
                const picked = order >= 0
                return (
                  <button
                    key={v.videoId}
                    type="button"
                    onClick={() => toggle(v.videoId)}
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
                        <Icon icon="video" className="text-default-400 text-2xl" />
                      )}
                    </span>

                    {picked && (
                      <span className="bg-primary absolute end-2 top-2 flex size-6 items-center justify-center rounded-full text-white">
                        {order + 1}
                      </span>
                    )}

                    {v.caption && (
                      <span className="text-default-600 block truncate p-2 text-xs">{v.caption}</span>
                    )}
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
