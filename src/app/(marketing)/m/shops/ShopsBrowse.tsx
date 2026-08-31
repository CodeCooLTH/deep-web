'use client'

// browse ร้านค้า (scale จริง) — ค้นหา + filter ตามเลเวล (tier) + infinite scroll ผ่าน server action.
// เรียง trust desc, โหลดต่อเนื่อง (cursor) → รองรับร้านไม่จำกัด
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

import CustomAvatar from '@core/components/mui/Avatar'
import type { TierChipColor } from '@/lib/trust-tier'
import { SHOP_CATEGORY_LABELS } from '@/lib/shop-categories'
import { browseShopsAction, type ShopItem } from './browse-action'

const catLabel = (key: string) => (SHOP_CATEGORY_LABELS as Record<string, string>)[key] ?? key

const TIER_FILTERS = ['ทั้งหมด', 'Deep Star', 'Deep Diamond', 'Deep Gold', 'Deep Silver', 'Deep Classic']

const tierBg = (c: TierChipColor) =>
  c === 'default' ? 'var(--mui-palette-action-selected)' : `var(--mui-palette-${c}-lightOpacity)`
const tierFg = (c: TierChipColor) =>
  c === 'default' ? 'var(--mui-palette-text-secondary)' : `var(--mui-palette-${c}-main)`

const LevelDots = ({ dots, color }: { dots: number; color: TierChipColor }) => (
  <span className='flex items-center gap-0.5'>
    {[1, 2, 3, 4, 5].map(i => (
      <span
        key={i}
        className='inline-block size-1.5 rounded-full'
        style={{ background: i <= dots ? tierFg(color) : 'var(--mui-palette-action-disabledBackground)' }}
      />
    ))}
  </span>
)

export default function ShopsBrowse({ initialCategory }: { initialCategory?: string }) {
  const [tier, setTier] = useState('ทั้งหมด')
  const [q, setQ] = useState('')
  const [category, setCategory] = useState(initialCategory ?? '')
  const [items, setItems] = useState<ShopItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const args = useCallback(
    (cursor?: string) => ({
      tier: tier === 'ทั้งหมด' ? undefined : tier,
      q: q.trim() || undefined,
      category: category || undefined,
      ...(cursor ? { cursor } : {})
    }),
    [tier, q, category]
  )

  // reset + load page 1 เมื่อ tier/q เปลี่ยน (debounce ค้นหา 300ms)
  useEffect(() => {
    let alive = true
    setLoading(true)
    const timer = setTimeout(() => {
      browseShopsAction(args())
        .then(r => {
          if (!alive) return
          setItems(r.items)
          setNextCursor(r.nextCursor)
        })
        .finally(() => alive && setLoading(false))
    }, 300)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [args])

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const r = await browseShopsAction(args(nextCursor))
      setItems(prev => [...prev, ...r.items])
      setNextCursor(r.nextCursor)
    } finally {
      setLoadingMore(false)
    }
  }, [nextCursor, loadingMore, args])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !nextCursor) return
    const ob = new IntersectionObserver(e => e[0]?.isIntersecting && loadMore(), { rootMargin: '200px' })
    ob.observe(el)
    return () => ob.disconnect()
  }, [nextCursor, loadMore])

  return (
    <div className='flex flex-col gap-4'>
      {/* ค้นหา */}
      <div className='flex items-center gap-2 h-11 pli-4 rounded-full bg-[var(--mui-palette-background-paper)] border border-[var(--mui-palette-divider)]'>
        <i className='tabler-search text-[1.2rem] text-[var(--mui-palette-text-secondary)] shrink-0' />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder='ค้นหาร้านค้า'
          className='flex-1 min-w-0 bg-transparent border-0 outline-none text-[14px] text-[var(--mui-palette-text-primary)]'
        />
        {q && (
          <button type='button' onClick={() => setQ('')} aria-label='ล้าง' className='border-0 bg-transparent cursor-pointer shrink-0'>
            <i className='tabler-x text-[1rem] text-[var(--mui-palette-text-disabled)]' />
          </button>
        )}
      </div>

      {/* หมวดที่เลือก (จากหน้า home) — ลบได้ */}
      {category && (
        <span className='self-start inline-flex items-center gap-1.5 h-8 pli-3 rounded-full bg-[var(--mui-palette-primary-lightOpacity)] text-[var(--mui-palette-primary-main)] text-[13px] font-medium'>
          <i className='tabler-tag text-[15px]' />
          {catLabel(category)}
          <button type='button' onClick={() => setCategory('')} aria-label='ล้างหมวด' className='border-0 bg-transparent cursor-pointer text-[var(--mui-palette-primary-main)] flex'>
            <i className='tabler-x text-[15px]' />
          </button>
        </span>
      )}

      {/* filter ตามเลเวล */}
      <div className='flex gap-2 overflow-x-auto -mx-4 px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        {TIER_FILTERS.map(t => {
          const active = t === tier
          return (
            <button
              key={t}
              type='button'
              onClick={() => setTier(t)}
              className={`shrink-0 h-11 flex items-center pli-3.5 rounded-full text-[13px] border transition-colors cursor-pointer ${
                active
                  ? 'bg-[var(--mui-palette-primary-main)] text-white border-[var(--mui-palette-primary-main)]'
                  : 'bg-[var(--mui-palette-background-paper)] text-[var(--mui-palette-text-secondary)] border-[var(--mui-palette-divider)]'
              }`}
            >
              {t.replace('Deep ', '')}
            </button>
          )
        })}
      </div>

      {/* list */}
      {loading ? (
        <div className='flex flex-col gap-2.5'>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className='rounded-2xl border border-[var(--mui-palette-divider)] flex items-center gap-3 p-5'>
              <span className='size-12 rounded-full bg-[var(--mui-palette-action-hover)] shrink-0' />
              <div className='flex-1 flex flex-col gap-1.5'>
                <span className='h-3 w-1/2 rounded bg-[var(--mui-palette-action-hover)]' />
                <span className='h-2.5 w-1/3 rounded bg-[var(--mui-palette-action-hover)]' />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className='flex flex-col items-center justify-center gap-2 pbs-16 pbe-10 text-center'>
          <div className='size-16 rounded-full bg-[var(--mui-palette-action-hover)] flex items-center justify-center'>
            <i className={`${q ? 'tabler-search-off' : 'tabler-building-store'} text-[28px] text-[var(--mui-palette-text-disabled)]`} />
          </div>
          <p className='text-[14px] m-0 text-[var(--mui-palette-text-secondary)]'>
            {q ? `ไม่พบร้านที่ตรงกับ "${q}"` : 'ยังไม่มีร้านในระดับนี้'}
          </p>
        </div>
      ) : (
        <div className='flex flex-col gap-2.5'>
          {items.map(s => (
            <Link
              key={s.username}
              href={`/u/${s.username}`}
              className='no-underline rounded-2xl bg-[var(--mui-palette-background-paper)] border border-[var(--mui-palette-divider)] flex items-center gap-3 p-5'
            >
              <div className='rounded-full p-[2.5px] shrink-0' style={{ background: tierFg(s.tierColor) }}>
                <div className='rounded-full p-[2px] bg-[var(--mui-palette-background-paper)]'>
                  <CustomAvatar src={s.image ?? undefined} size={46}>
                    {s.shopName.slice(0, 1)}
                  </CustomAvatar>
                </div>
              </div>
              <div className='flex-1 min-w-0 flex flex-col gap-1'>
                <div className='flex items-center gap-1.5 min-w-0'>
                  <span className='text-[14px] font-medium truncate text-[var(--mui-palette-text-primary)]'>{s.shopName}</span>
                  {s.verified && (
                    <i className='tabler-rosette-discount-check-filled text-[15px] text-[var(--mui-palette-success-main)] shrink-0' />
                  )}
                </div>
                <div className='flex items-center gap-2'>
                  <span
                    className='inline-flex items-center gap-1 pli-2 plb-0.5 rounded-full leading-none'
                    style={{ background: tierBg(s.tierColor), color: tierFg(s.tierColor) }}
                  >
                    <i className='tabler-shield-check-filled text-[12px]' />
                    {s.tier}
                  </span>
                  <LevelDots dots={s.dots} color={s.tierColor} />
                </div>
              </div>
              <div className='flex flex-col items-center shrink-0 pli-1'>
                <span className='text-[20px] font-extrabold leading-none' style={{ color: tierFg(s.tierColor) }}>
                  {s.trustScore}
                </span>
                <span className='text-[10px] leading-none mbs-0.5 text-[var(--mui-palette-text-disabled)]'>คะแนน Trust</span>
              </div>
            </Link>
          ))}

          {nextCursor && (
            <div ref={sentinelRef} className='h-10 flex items-center justify-center'>
              {loadingMore && <i className='tabler-loader-2 animate-spin text-[20px] text-[var(--mui-palette-text-disabled)]' />}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
