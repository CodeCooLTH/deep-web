import type { Metadata } from 'next'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'

import Link from 'next/link'

import CustomAvatar from '@core/components/mui/Avatar'
import { LinkChip } from '@/app/(marketing)/_components/mui-link'
import { browseAuctions, listCategories } from '@/services/auction.service'

export const metadata: Metadata = { title: 'ประมูล' }

const baht = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 })
const resolveImg = (u: string) => (u.startsWith('http') ? u : `/api/files/${u}`)

/** browse ประมูล (mobile) — เชื่อม auction ฝั่ง seller; filter หมวดผ่าน ?category= */
const VALID_SORT = new Set(['bidders', 'ending', 'priceHigh', 'priceLow'])

export default async function MobileAuctionsPage({
  searchParams
}: {
  searchParams: Promise<{ category?: string; sort?: string }>
}) {
  const { category: rawCategory, sort: rawSort } = await searchParams
  const category = rawCategory?.trim() || null
  const sort = (VALID_SORT.has(rawSort ?? '') ? rawSort : 'bidders') as 'bidders' | 'ending' | 'priceHigh' | 'priceLow'

  const [{ items }, categoriesRaw] = await Promise.all([
    browseAuctions({ category, page: 1, sort }),
    listCategories()
  ])

  return (
    <>
      <Typography variant='h5' className='font-semibold'>
        {category ? `ประมูล · ${category}` : 'กำลังประมูล'}
      </Typography>

      {/* ตัวกรองหมวด */}
      <div className='flex flex-wrap gap-2'>
        <LinkChip
          href='/m/auctions'
          label='ทั้งหมด'
          color={category ? 'default' : 'primary'}
          variant={category ? 'outlined' : 'filled'}
        />
        {categoriesRaw.map(c => {
          const active = category === c.name
          return (
            <LinkChip
              key={c.id}
              href={`/m/auctions?category=${encodeURIComponent(c.name)}`}
              label={c.name}
              color={active ? 'primary' : 'default'}
              variant={active ? 'filled' : 'outlined'}
            />
          )
        })}
      </div>

      {items.length === 0 ? (
        <div className='flex flex-col items-center justify-center gap-3 plb-16 text-center'>
          <CustomAvatar skin='light' variant='rounded' color='secondary' size={52}>
            <i className='tabler-hammer text-[30px]' />
          </CustomAvatar>
          <Typography color='text.secondary'>
            {category ? `ยังไม่มีประมูลในหมวด "${category}"` : 'ยังไม่มีประมูลที่กำลังเปิด'}
          </Typography>
        </div>
      ) : (
        <div className='grid grid-cols-2 gap-3'>
          {items.map(a => (
            <Link key={a.id} href={`/a/${a.id}`} className='no-underline'>
              <Card className='h-full overflow-hidden'>
                <div className='relative aspect-square bg-[var(--mui-palette-action-hover)]'>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.imageUrl ? resolveImg(a.imageUrl) : ''}
                    alt={a.title}
                    loading='lazy'
                    className='absolute inset-0 is-full bs-full object-cover'
                  />
                  <span className='absolute top-2 inline-start-2'>
                    <Chip size='small' color='primary' variant='filled' label={`${a.bidCount} บิด`} />
                  </span>
                </div>
                <CardContent className='!p-3 flex flex-col gap-0.5'>
                  <Typography variant='body2' className='font-medium line-clamp-2 leading-snug' color='text.primary'>
                    {a.title}
                  </Typography>
                  <Typography className='font-bold' color='primary.main'>
                    {baht.format(a.currentPrice)}
                  </Typography>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
