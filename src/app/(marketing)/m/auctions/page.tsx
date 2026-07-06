import type { Metadata } from 'next'
import Link from 'next/link'

import { browseAuctions, listCategories } from '@/services/auction.service'
import { MPageTitle, MEmpty } from '../_components/ui'

export const metadata: Metadata = { title: 'ประมูล' }

const baht = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 })
const resolveImg = (u: string) => (u.startsWith('http') ? u : `/api/files/${u}`)

const VALID_SORT = new Set(['bidders', 'ending', 'priceHigh', 'priceLow'])

/** browse ประมูล (mobile) — filter หมวดผ่าน ?category= (URL /m/auctions) */
export default async function MobileAuctionsPage({
  searchParams
}: {
  searchParams: Promise<{ category?: string; sort?: string }>
}) {
  const { category: rawCategory, sort: rawSort } = await searchParams
  const category = rawCategory?.trim() || null
  const sort = (VALID_SORT.has(rawSort ?? '') ? rawSort : 'bidders') as 'bidders' | 'ending' | 'priceHigh' | 'priceLow'

  const [{ items }, categoriesRaw] = await Promise.all([browseAuctions({ category, page: 1, sort }), listCategories()])

  const chip = (active: boolean) =>
    `shrink-0 h-8 flex items-center pli-3.5 rounded-full text-[13px] no-underline border transition-colors ${
      active
        ? 'bg-[var(--mui-palette-primary-main)] text-white border-[var(--mui-palette-primary-main)]'
        : 'bg-[var(--mui-palette-background-paper)] text-[var(--mui-palette-text-secondary)] border-[var(--mui-palette-divider)]'
    }`

  return (
    <div className='flex flex-col gap-4'>
      <MPageTitle title={category ? `ประมูล · ${category}` : 'กำลังประมูล'} back='/dashboard' />

      {/* ตัวกรองหมวด (เลื่อนแนวนอน) */}
      <div className='flex gap-2 overflow-x-auto -mx-4 px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        <Link href='/m/auctions' className={chip(!category)}>
          ทั้งหมด
        </Link>
        {categoriesRaw.map(c => (
          <Link key={c.id} href={`/m/auctions?category=${encodeURIComponent(c.name)}`} className={chip(category === c.name)}>
            {c.name}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <MEmpty
          icon='tabler-gavel'
          text={category ? `ยังไม่มีประมูลในหมวด "${category}"` : 'ยังไม่มีประมูลที่กำลังเปิด'}
        />
      ) : (
        <div className='grid grid-cols-2 gap-2.5'>
          {items.map(a => (
            <Link key={a.id} href={`/a/${a.id}`} className='no-underline block'>
              <div className='rounded-2xl overflow-hidden bg-[var(--mui-palette-background-paper)] border border-[var(--mui-palette-divider)]'>
                <div className='relative aspect-square bg-[var(--mui-palette-action-hover)]'>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.imageUrl ? resolveImg(a.imageUrl) : ''}
                    alt={a.title}
                    loading='lazy'
                    className='absolute inset-0 is-full bs-full object-cover'
                  />
                  <span className='absolute top-2 inline-start-2 text-[11px] font-semibold text-white pli-2 plb-0.5 rounded-full bg-[var(--mui-palette-primary-main)]'>
                    {a.bidCount} บิด
                  </span>
                </div>
                <div className='p-2.5 flex flex-col gap-1'>
                  <p className='text-[13px] leading-tight line-clamp-2 m-0 text-[var(--mui-palette-text-primary)]'>{a.title}</p>
                  <span className='text-[15px] font-bold text-[var(--mui-palette-primary-main)]'>{baht.format(a.currentPrice)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
