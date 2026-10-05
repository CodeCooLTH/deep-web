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
 * Base: src/app/(paces)/seller/(dashboard)/settings/auto-reply/AutoReplyListing.tsx
 *   — TablePagination (props ล้วน ไม่ผูก react-table) แบ่งหน้าคลิปในแท็บ (2026-10-05)
 *
 * Base: src/app/(paces)/seller/(dashboard)/public-profile/components/ProfileItemVisibilityClient.tsx
 *   — ช่องค้นหา (form-input + ไอคอน) และชิปกรองแบบ aria-pressed (การ์ดพี่น้องในหน้าเดียวกัน)
 * Base: src/app/(paces)/seller/(dashboard)/settings/auto-reply/[id]/KeywordEditorClient.tsx
 *   — แถบบันทึก sticky ที่ยกตัวพ้น SellerBottomNav ด้วย safe-area (carve-out เดิม)
 *
 * ออกแบบใหม่ 2026-10-05 ตาม /impeccable critique (20/40):
 *   - โหลดพังเคยตกไปเป็นหน้าว่าง "ไปเชื่อมช่องทาง" → แยกสถานะ error + ปุ่มลองใหม่
 *   - ไม่มีที่ดูชุดที่เลือก/จัดลำดับได้แค่ติ๊กใหม่ → รายการ "ลำดับบนหน้าร้าน" แนวตั้ง ปุ่มขึ้น/ลง/เอาออก
 *     (ปุ่ม ไม่ใช่ลาก — กลุ่มผู้ขายสูงวัยใช้ลากบนมือถือไม่ถนัด) · user เลือกแบบ B จากม็อกอัพ 3 แบบ:
 *     เดสก์ท็อป = แผงขวาติดจอ · มือถือ = ยุบในแถบล่าง แตะแล้วเปิดแผ่นจากล่าง (กริดได้ที่เต็มจอ)
 *     ม็อกอัพ: docs/superpowers/specs/2026-10-05-shop-videos-picker-mockup.html
 *   - ปุ่มบันทึกอยู่ท้ายกริดยาว + ไม่รู้ว่ายังไม่ได้บันทึก → แถบติดล่างจอ กดได้เมื่อมีของเปลี่ยน
 *     + beforeunload เตือน (การ์ดพี่น้องในหน้าเดียวกันบันทึกเองทันที คนจึงเผลอคิดว่าอันนี้ก็เช่นกัน)
 *   - ค้นหาจากคำบรรยาย + ชิป "ที่เลือกแล้ว" สำหรับเพจที่มี reel เป็นร้อย
 *
 * Base: src/app/(paces)/seller/(dashboard)/orders/components/OrderQrSheet.tsx
 *   — แผ่นจากล่าง: portal ออก body + scrim + grip + Esc + useLockBodyScroll
 *
 * Toast: pacesToast เท่านั้น (Hard Rule 9 — ฝั่ง (paces) ห้ามใช้ toast ของฝั่ง buyer)
 * Paces primitive เท่านั้น — ห้าม arbitrary value (Hard Rule 7)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'

import { pacesToast } from '@/lib/paces-toast'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
// จาก lib ไม่ใช่จาก service — service import prisma ซึ่งลากเข้า bundle ฝั่ง client ไม่ได้
import { MAX_SHOP_VIDEOS } from '@/lib/shop-video'
import TablePagination from '@/components/table/TablePagination'
import SellerEmptyState from '../../_shared/SellerEmptyState'

/** คลิปต่อหน้า — 24 หาร 2/3/4/6 คอลัมน์ลงตัว ทุกหน้าเต็มแถวทุกขนาดจอ */
const PAGE_SIZE = 24

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

/**
 * ป้ายบอกแหล่งที่มาบนการ์ดที่ให้เลือก
 *
 * ใช้ไฟล์โลโก้แบรนด์จริงชุดเดียวกับหน้าแชท (ChannelBadge) — user ทัก 2026-07-26 ว่าไอคอนคนละชุด
 * กับที่อื่นในระบบ ก่อนหน้านี้ที่นี่วาดเป็นวงกลมสี Paces (bg-info/bg-danger) แล้วใส่ glyph สีขาว
 * ทับ ซึ่งไม่ใช่โลโก้จริงของแพลตฟอร์ม และ IG ที่จริงเป็นวงกลมไล่สีก็กลายเป็นวงแดงทึบ
 *
 * โลโก้พวกนี้มีทั้งสีและรูปทรงในตัวอยู่แล้ว จึงไม่ต้องมีพื้นวงกลมรองอีกชั้น (เหตุผลเดียวกับ
 * ChannelBadgeOverlay) — brand asset เป็น carve-out ของ Hard Rule 6
 */
const SOURCE: Record<string, { logo: string; label: string }> = {
  FACEBOOK: { logo: '/images/logos/facebook.svg', label: 'Facebook' },
  INSTAGRAM: { logo: '/images/logos/instagram-circle.svg', label: 'Instagram' },
}

/** โลโก้ช่องทาง — ถอยไปไอคอนกลางเมื่อเจอ provider ที่ยังไม่มีไฟล์โลโก้ (เช่น TikTok ที่รออนุมัติ) */
function SourceLogo({ provider, size }: { provider: string; size: number }) {
  const src = SOURCE[provider]
  if (!src) return <Icon icon="tabler:video" className="text-default-400" width={size} />
  return (
    // eslint-disable-next-line @next/next/no-img-element -- โลโก้ static ใน public/ ไม่ต้องผ่าน optimizer
    <img src={src.logo} alt={src.label} width={size} height={size} className="shrink-0 rounded-full" />
  )
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

type VideoDict = ReturnType<typeof useT>['publicProfile']['videos']

/**
 * รายการ "ลำดับบนหน้าร้าน" แนวตั้ง — ใช้ทั้งแผงขวา (เดสก์ท็อป) และแผ่นล่าง (มือถือ) ชุดเดียวกัน
 * ประกาศระดับ module ไม่ใช่ใน render (docs/conventions/component-declared-in-render.md)
 */
function SelectedOrderList({
  keys,
  byKey,
  onMove,
  onRemove,
  tv,
}: {
  keys: string[]
  byKey: Map<string, AvailableVideo>
  onMove: (index: number, delta: -1 | 1) => void
  onRemove: (key: string) => void
  tv: VideoDict
}) {
  if (keys.length === 0) {
    return <p className="text-default-500 py-4 text-sm">{tv.trayEmpty}</p>
  }
  return (
    <ol className="divide-default-100 divide-y">
      {keys.map((k, i) => {
        const v = byKey.get(k)
        const name =
          v?.caption || fmt(tv.clipFallback, { source: v?.accountName ?? SOURCE[v?.provider ?? '']?.label ?? '' })
        return (
          <li key={k} className="flex items-center gap-2 py-2">
            <span className="bg-primary flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white">
              {i + 1}
            </span>
            {v?.thumbnailUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element -- รูปปกจาก CDN ของแพลตฟอร์ม */
              <img src={v.thumbnailUrl} alt="" className="size-12 shrink-0 rounded object-cover" />
            ) : (
              <span className="bg-default-100 flex size-12 shrink-0 items-center justify-center rounded">
                <Icon icon="tabler:video" className="text-default-400" aria-hidden="true" />
              </span>
            )}
            <span className="text-default-800 line-clamp-2 min-w-0 flex-1 text-sm">{name}</span>
            <span className="text-default-600 flex shrink-0">
              <button
                type="button"
                className="hover:text-primary flex size-11 items-center justify-center disabled:opacity-30"
                onClick={() => onMove(i, -1)}
                disabled={i === 0}
                aria-label={`${tv.moveEarlier}: ${name}`}
              >
                <Icon icon="tabler:chevron-up" className="text-lg" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="hover:text-primary flex size-11 items-center justify-center disabled:opacity-30"
                onClick={() => onMove(i, 1)}
                disabled={i === keys.length - 1}
                aria-label={`${tv.moveLater}: ${name}`}
              >
                <Icon icon="tabler:chevron-down" className="text-lg" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="hover:text-danger flex size-11 items-center justify-center"
                onClick={() => onRemove(k)}
                aria-label={`${tv.remove}: ${name}`}
              >
                <Icon icon="tabler:x" className="text-lg" aria-hidden="true" />
              </button>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * แผ่นจากล่าง (มือถือเท่านั้น — เปิดจากแถบล่างที่เป็น lg:hidden)
 * 🛑 portal ออก body: แถบล่างที่เปิดแผ่นนี้เป็น sticky z-20 ซึ่งสร้าง stacking context — ถ้าไม่ portal
 * แผ่นจะแข่ง z-index ได้แค่ภายในแถบ (บทเรียน OrderQrSheet 2026-08-17)
 */
function ReorderSheet({ onClose, tv, children }: { onClose: () => void; tv: VideoDict; children: React.ReactNode }) {
  useLockBodyScroll(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // แผ่นนี้เปิดจากการกดปุ่มเท่านั้น (ไม่เคย render ตอน SSR) จึงไม่ต้องมี mounted guard แบบ OrderQrSheet
  return createPortal(
    <div className="fixed inset-0 z-80 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={tv.trayTitle}>
      <button type="button" aria-label={tv.close} onClick={onClose} className="bg-default-900/40 absolute inset-0" />
      <div className="bg-card relative flex max-h-full w-full max-w-md flex-col rounded-t-2xl px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2 shadow-lg"> {/* carve-out: safe-area ไม่มี token (precedent OrderQrSheet) */}
        <div className="bg-default-300 mx-auto mb-2 h-1 w-9 rounded-full" />
        <div className="flex items-center justify-between">
          <h3 className="text-default-900 text-base font-semibold">{tv.trayTitle}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={tv.close}
            className="text-default-500 flex size-11 items-center justify-center"
          >
            <Icon icon="tabler:x" className="text-xl" aria-hidden="true" />
          </button>
        </div>
        <p className="text-default-500 text-sm">{tv.trayHint}</p>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export default function ShopVideosClient() {
  const t = useT()
  const tv = t.publicProfile.videos
  const [loading, setLoading] = useState(true)
  // แยกจาก "ไม่มีคลิป" — เดิมโหลดพังแล้ว available=[] ตกไปเป็น empty state ที่ส่งร้านไปเชื่อมช่องทาง
  // ทั้งที่เชื่อมอยู่แล้ว (critique P0)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [available, setAvailable] = useState<AvailableVideo[]>([])
  // key = PROVIDER:videoId — id คนละแพลตฟอร์มชนกันได้ในทางทฤษฎี · ลำดับใน array = ลำดับบนหน้าร้าน
  const [chosen, setChosen] = useState<string[]>([])
  // ชุดที่บันทึกล่าสุด — ใช้ตัดสินว่ามีของยังไม่บันทึกไหม
  const [saved, setSaved] = useState<string[]>([])
  // ค่าตั้งต้นก่อน GET ตอบ — ต้องเป็นค่าเดียวกับ SSOT ไม่งั้นช่วงกำลังโหลดจะขึ้นเพดานเก่าให้ร้านเห็น
  // แล้วเด้งเป็นเลขใหม่ทีหลัง (ตัวจริงมาจาก data.max ในบรรทัดถัดลงไป)
  const [max, setMax] = useState(MAX_SHOP_VIDEOS)
  // แท็บช่องทางที่กำลังดู — '' = ยังไม่เลือก (ตั้งเป็นช่องทางแรกหลังโหลด)
  const [activeSource, setActiveSource] = useState('')
  // หน้าในแท็บที่กำลังดู — server คืน reel ทั้งเพจ (ไม่ตัดที่ 25 แล้ว) แท็บเดียวมีได้เป็นร้อยคลิป
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState('')
  const [onlySelected, setOnlySelected] = useState(false)
  // แผ่นจัดลำดับบนมือถือ (<lg) — เดสก์ท็อปมีแผงขวาแสดงตลอดอยู่แล้ว
  const [sheetOpen, setSheetOpen] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadFailed(false)
    try {
      const res = await fetch('/api/shops/current/videos', { cache: 'no-store' })
      if (!res.ok) {
        setLoadFailed(true)
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
        pacesToast.warning(tv.partialWarning)
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
      const savedKeys = [...data.selected]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => `${s.provider}:${s.videoId}`)
      const stillValid = savedKeys.filter((k) => availableKeys.has(k))
      setChosen(stillValid)
      // เทียบ dirty กับชุดที่ตัดแล้ว — ไม่งั้นคลิปที่ถูกตัดทิ้งทำให้ปุ่มบันทึกสว่างตั้งแต่เปิดหน้า
      // ทั้งที่ร้านยังไม่ได้แตะอะไร (ส่วนการเตือนว่าถูกตัดอยู่ใน toast ด้านล่าง)
      setSaved(stillValid)

      // ไม่เตือนเมื่อดึงมาไม่ครบ เพราะที่หายอาจแค่ยังไม่ได้โหลด ไม่ใช่ถูกลบจริง
      if (!data.partial && stillValid.length < savedKeys.length) {
        pacesToast.warning(fmt(tv.prunedWarning, { n: savedKeys.length - stillValid.length }))
      }
    } catch {
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
    // `t` เป็นค่าคงที่ระดับ module ต่อภาษา (LocaleProvider คืน dictionary ไม่ใช่ object literal)
    // ⇒ identity เสถียร ใส่ dep array ได้โดยไม่เกิดลูป (docs/conventions/hook-return-identity-in-deps.md)
  }, [tv])

  useEffect(() => {
    void load()
  }, [load])

  const dirty = chosen.length !== saved.length || chosen.some((k, i) => k !== saved[i])

  // ออกจากหน้า/รีเฟรชตอนยังไม่บันทึก — ให้เบราว์เซอร์ถามก่อน (ข้อความ native เลือกเองไม่ได้)
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const byKey = useMemo(
    () => new Map<string, AvailableVideo>(available.map((v) => [`${v.provider}:${v.videoId}`, v])),
    [available],
  )

  // ลำดับที่กดเลือกคือลำดับที่จะแสดงบนหน้าร้าน — ปรับทีหลังได้ที่แถบ "คลิปที่จะแสดง"
  // toast อยู่นอก setState updater โดยตั้งใจ — updater ต้องไม่มี side effect (StrictMode เรียกสองรอบ)
  const toggle = (key: string) => {
    if (chosen.includes(key)) {
      setChosen(chosen.filter((k) => k !== key))
      return
    }
    if (chosen.length >= max) {
      pacesToast.warning(fmt(tv.fullHint, { max }))
      return
    }
    setChosen([...chosen, key])
  }

  const move = (index: number, delta: -1 | 1) => {
    const next = [...chosen]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    setChosen(next)
  }

  /** คืน true เมื่อบันทึกสำเร็จ — แผ่นล่างปิดตัวเองเฉพาะกรณีนี้ ล้มแล้วต้องค้างไว้ให้ลองใหม่ */
  const save = async (): Promise<boolean> => {
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
        setSaved(chosen)
        pacesToast.success(tv.saveSuccess)
        return true
      }
      const data = (await res.json().catch(() => null)) as { error?: string; code?: string } | null
      // แยกข้อความ: ตรวจไม่สำเร็จ = ลองใหม่ได้ / ไม่ใช่เจ้าของ = ต้องเลือกใหม่
      // `data.error` มาจาก API ซึ่งยังตอบเป็นไทยเสมอ — ตัวที่แปลได้คือ fallback ฝั่งเรา
      if (data?.code === 'VERIFY_UNAVAILABLE') {
        pacesToast.warning(data.error ?? tv.verifyUnavailable)
        return false
      }
      pacesToast.error(data?.error ?? tv.saveError)
      return false
    } catch {
      pacesToast.error(tv.saveException)
      return false
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

  // นับที่เลือกต่อแท็บด้วย source ของคลิปจริง — เดิมนับด้วย prefix `FACEBOOK:` ทำให้ร้านที่มี
  // 2 เพจเห็นเลขรวมของทุกเพจซ้ำบนทุกแท็บ (critique P1)
  const pickedPerSource = chosen.reduce((acc, k) => {
    const src = sourceKeyOf(byKey.get(k))
    acc.set(src, (acc.get(src) ?? 0) + 1)
    return acc
  }, new Map<string, number>())

  const q = query.trim().toLowerCase()
  const inSource = available.filter(
    (v) =>
      sourceKeyOf(v) === activeSource &&
      (!onlySelected || chosen.includes(`${v.provider}:${v.videoId}`)) &&
      (!q || (v.caption ?? '').toLowerCase().includes(q)),
  )
  const pageCount = Math.ceil(inSource.length / PAGE_SIZE)
  // คำค้น/ตัวกรองทำให้จำนวนหน้าหดได้ — หนีบไว้ไม่ให้ค้างอยู่หน้าที่ไม่มีแล้ว
  const safePage = Math.min(page, Math.max(pageCount - 1, 0))
  const visible = inSource.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  // ที่เลือกไว้เป็น key ระดับทั้งร้าน (chosen) จึงเลือกข้ามหน้าได้ — เปลี่ยนหน้าแค่เปลี่ยนสิ่งที่เห็น
  // เลื่อนกลับหัวกริด ไม่งั้นผู้ใช้ค้างอยู่กลางหน้าใหม่ (ปุ่มเลขหน้าอยู่ใต้กริด)
  const goTo = (i: number) => {
    setPage(i)
    gridRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  const full = chosen.length >= max

  if (loading) {
    return (
      <div className="card">
        <div className="card-body flex items-center gap-2 text-default-500">
          <Icon icon="tabler:loader-2" className="animate-spin text-base" />
          {tv.loading}
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">{tv.cardTitle}</h4>
        <p className="text-default-500 mt-1 text-sm">{fmt(tv.subtitle, { max })}</p>
      </div>

      <div className="card-body">
        {loadFailed ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center" role="alert">
            <Icon icon="tabler:cloud-off" className="text-default-400 text-3xl" aria-hidden="true" />
            <div>
              <p className="text-default-900 font-semibold">{tv.loadErrorTitle}</p>
              <p className="text-default-500 mt-1 text-sm">{tv.loadErrorDescription}</p>
            </div>
            <button
              type="button"
              className="btn bg-primary hover:bg-primary-hover min-h-11 text-white sm:min-h-0"
              onClick={() => void load()}
            >
              <Icon icon="tabler:refresh" className="text-base" aria-hidden="true" />
              {tv.retry}
            </button>
          </div>
        ) : available.length === 0 ? (
          <SellerEmptyState
            icon="video"
            title={tv.emptyTitle}
            description={tv.emptyDescription}
            action={{ label: tv.emptyAction, href: '/settings/channels' }}
            compact
          />
        ) : (
          <>
            {/* ── เดสก์ท็อป 2 คอลัมน์: ซ้าย = เลือก (2/3) · ขวา = แผงลำดับติดจอ (1/3) · มือถือเรียงเดี่ยว ── */}
            <div className="lg:grid lg:grid-cols-3 lg:items-start lg:gap-6">
            <div className="min-w-0 lg:col-span-2">

            {/* แท็บช่องทาง — 17 คลิปจากหลายเพจปนกันในกริดเดียวหายาก (user ทัก 2026-07-26)
                Base: src/app/(paces)/seller/(dashboard)/dashboard/components/SalesReport.tsx (nav tabs)
                ใช้ class ของ Paces แต่คุม active ด้วย React ไม่ใช่ data-hs-tab ของ Preline
                เพราะหน้านี้ re-render ทุกครั้งที่ติ๊กเลือก ซึ่งเป็นเคสที่ Preline เคยพังในโปรเจกต์นี้ */}
            <nav className="flex gap-x-1 overflow-x-auto" aria-label={tv.channelsTabLabel}>
              {sources.map((src) => {
                const on = src.key === activeSource
                const picked = pickedPerSource.get(src.key) ?? 0
                return (
                  <button
                    key={src.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setActiveSource(src.key)
                      setPage(0)
                    }}
                    className={`inline-flex items-center gap-2 whitespace-nowrap border-b px-4 py-3 text-sm focus:outline-hidden ${
                      on
                        ? 'border-primary text-primary font-semibold'
                        : 'text-default-600 hover:text-primary border-transparent'
                    }`}
                  >
                    <SourceLogo provider={src.provider} size={18} />
                    <span className="max-w-40 truncate">{src.label}</span>
                    <span className="text-default-400">{src.count}</span>
                    {picked > 0 && (
                      <span className="badge bg-primary/15 text-primary inline-flex items-center gap-0.5">
                        <Icon icon="tabler:check" className="text-xs" aria-hidden="true" />
                        {picked}
                      </span>
                    )}
                  </button>
                )
              })}
            </nav>

            {/* ค้นหา + ชิปกรอง — ท่าเดียวกับการ์ด "ซ่อนรายการ" ในหน้าเดียวกัน */}
            <div className="mt-base flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Icon
                  icon="tabler:search"
                  className="text-default-400 pointer-events-none absolute inset-y-0 start-3 my-auto size-4"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  className="form-input ps-9"
                  placeholder={tv.searchPlaceholder}
                  aria-label={tv.searchPlaceholder}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setPage(0)
                  }}
                />
              </div>
              <div className="flex gap-2">
                {[
                  { on: !onlySelected, label: tv.filterAll, value: false },
                  { on: onlySelected, label: `${tv.filterSelected} ${chosen.length}`, value: true },
                ].map((c) => (
                  <button
                    key={String(c.value)}
                    type="button"
                    aria-pressed={c.on}
                    onClick={() => {
                      setOnlySelected(c.value)
                      setPage(0)
                    }}
                    className={
                      c.on
                        ? 'bg-primary/10 text-primary-ink inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold whitespace-nowrap lg:min-h-9'
                        : 'bg-default-100 text-default-600 hover:bg-default-200 inline-flex min-h-11 items-center rounded-full px-3 text-xs whitespace-nowrap lg:min-h-9'
                    }
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {visible.length === 0 ? (
              <p className="text-default-500 mt-base py-6 text-center text-sm">{tv.noMatch}</p>
            ) : (
              <div
                ref={gridRef}
                className="mt-base grid scroll-mt-4 grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6"
              >
                {visible.map((v) => {
                  const key = `${v.provider}:${v.videoId}`
                  const order = chosen.indexOf(key)
                  const picked = order >= 0
                  const name = v.caption || fmt(tv.clipFallback, { source: v.accountName ?? SOURCE[v.provider]?.label ?? '' })
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggle(key)}
                      aria-pressed={picked}
                      className={`relative overflow-hidden rounded-lg border text-start transition-shadow ${
                        picked ? 'border-primary ring-primary ring-2' : 'border-default-200 hover:border-default-300'
                      }`}
                    >
                      <span className="bg-default-100 relative flex aspect-square items-center justify-center">
                        {v.thumbnailUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element -- รูปปกจาก CDN ของแพลตฟอร์ม */
                          <img src={v.thumbnailUrl} alt={name} className="size-full object-cover" />
                        ) : (
                          <Icon icon="tabler:video" className="text-default-400 text-2xl" aria-hidden="true" />
                        )}
                        {/* ทับสีจาง ๆ บนรูปที่เลือก — กรอบอย่างเดียวบางเกินจะเห็นบนมือถือ (critique) */}
                        {picked && <span className="bg-primary/15 absolute inset-0" aria-hidden="true" />}
                      </span>

                      {picked && (
                        <span className="bg-primary absolute end-2 top-2 flex size-7 items-center justify-center rounded-full text-sm font-semibold text-white">
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
                          <SourceLogo provider={v.provider} size={14} />
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
            )}

            {pageCount > 1 && (
              <div className="mt-base">
                <TablePagination
                  totalItems={inSource.length}
                  start={safePage * PAGE_SIZE + 1}
                  end={Math.min((safePage + 1) * PAGE_SIZE, inSource.length)}
                  // ข้อความ info ใน component เป็นไทยตายตัว หน้านี้สองภาษา — จำนวนคลิปอยู่บนแท็บแล้ว
                  showInfo={false}
                  previousPage={() => goTo(safePage - 1)}
                  canPreviousPage={safePage > 0}
                  pageCount={pageCount}
                  pageIndex={safePage}
                  setPageIndex={goTo}
                  nextPage={() => goTo(safePage + 1)}
                  canNextPage={safePage < pageCount - 1}
                />
              </div>
            )}
            </div>

            {/* ── เดสก์ท็อป: แผงลำดับติดจอทางขวา — เห็นชุดที่เลือก/ลำดับ/ปุ่มบันทึกตลอดโดยไม่กินที่กริด ── */}
            <aside className="border-default-200 hidden rounded-lg border lg:sticky lg:top-20 lg:block">
              <div className="border-default-200 border-b px-4 py-3">
                <h5 className="text-default-900 text-sm font-semibold">{tv.trayTitle}</h5>
                <p className="mt-0.5 text-xs" aria-live="polite">
                  <span className={full ? 'text-warning font-semibold' : 'text-default-500'}>
                    {fmt(tv.selectedCount, { n: chosen.length, max })}
                  </span>
                  {dirty && <span className="text-default-500"> · {tv.unsaved}</span>}
                </p>
              </div>
              <div className="max-h-96 overflow-y-auto px-3">
                <SelectedOrderList keys={chosen} byKey={byKey} onMove={move} onRemove={toggle} tv={tv} />
              </div>
              <div className="border-default-200 border-t p-3">
                <button
                  type="button"
                  className="btn bg-primary hover:bg-primary-hover w-full text-white disabled:opacity-50"
                  onClick={() => void save()}
                  disabled={saving || !dirty}
                >
                  {saving ? tv.saving : t.common.save}
                </button>
              </div>
            </aside>
            </div>

            {/* ── มือถือ: แถบล่างยุบชุดที่เลือกเหลือรูปย่อ 3 รูป + ตัวนับ — แตะแล้วเปิดแผ่นจัดลำดับ
                 กริดได้ที่เต็มจอ (เพจมี reel เป็นร้อย) แทนแถบแนวนอนที่กินจอบน 1/4
                 ระยะล่าง = 4.5rem (SellerBottomNav h-18) + safe-area ให้ชิดขอบบนของ nav พอดี
                 -mx-5 -mb-5 = กินขอบ padding ของ card-body ให้แถบเต็มความกว้างการ์ด ── */}
            <div className="bg-card border-default-200 sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 -mx-5 -mb-5 mt-base flex items-center gap-3 rounded-b border-t px-5 py-3 lg:hidden"> {/* carve-out: safe-area ไม่มี token (เดียวกับ KeywordEditorClient) */}
              <button
                type="button"
                className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-start"
                onClick={() => setSheetOpen(true)}
                aria-haspopup="dialog"
              >
                {chosen.length > 0 && (
                  <span className="flex shrink-0 -space-x-2">
                    {chosen.slice(0, 3).map((k) => {
                      const v = byKey.get(k)
                      return v?.thumbnailUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element -- รูปปกจาก CDN ของแพลตฟอร์ม */
                        <img key={k} src={v.thumbnailUrl} alt="" className="border-card size-8 rounded-full border-2 object-cover" />
                      ) : (
                        <span key={k} className="bg-default-100 border-card size-8 rounded-full border-2" />
                      )
                    })}
                  </span>
                )}
                <span className="min-w-0" aria-live="polite">
                  <span className={`block truncate text-sm ${full ? 'text-warning font-semibold' : 'text-default-800'}`}>
                    {fmt(tv.selectedCount, { n: chosen.length, max })}
                    {dirty && <span className="text-default-500 text-xs"> · {tv.unsaved}</span>}
                  </span>
                  <span className="text-primary flex items-center gap-0.5 text-xs">
                    {tv.openOrder}
                    <Icon icon="tabler:chevron-up" aria-hidden="true" />
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="btn bg-primary hover:bg-primary-hover min-h-11 shrink-0 text-white disabled:opacity-50"
                onClick={() => void save()}
                disabled={saving || !dirty}
              >
                {saving ? tv.saving : t.common.save}
              </button>
            </div>

            {sheetOpen && (
              <ReorderSheet onClose={() => setSheetOpen(false)} tv={tv}>
                <SelectedOrderList keys={chosen} byKey={byKey} onMove={move} onRemove={toggle} tv={tv} />
                <div className="border-default-200 mt-3 flex gap-3 border-t pt-3">
                  <button
                    type="button"
                    className="btn bg-light text-dark hover:bg-light-hover min-h-11 flex-1"
                    onClick={() => setSheetOpen(false)}
                  >
                    {tv.addMore}
                  </button>
                  <button
                    type="button"
                    className="btn bg-primary hover:bg-primary-hover min-h-11 flex-1 text-white disabled:opacity-50"
                    onClick={async () => {
                      if (await save()) setSheetOpen(false)
                    }}
                    disabled={saving || !dirty}
                  >
                    {saving ? tv.saving : t.common.save}
                  </button>
                </div>
              </ReorderSheet>
            )}
          </>
        )}
      </div>
    </div>
  )
}
