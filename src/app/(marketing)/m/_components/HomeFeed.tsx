// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'

// Next Imports
import Link from 'next/link'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'
import { LinkButton } from '@/app/(marketing)/_components/mui-link'

/**
 * หน้าแรก mobile web app (/m) — feed "ข้อมูลคนอื่น/ระบบ" (discovery) แบบ Deep-App:
 * เช็กก่อนโอน → หมวดหมู่ (2 แถวเลื่อน) → กำลังประมูล → ประมูลใกล้จบ → ร้านน่าเชื่อถือ.
 * Server component ล้วน (ไม่มี client JS). เชื่อม auction/shop/category ฝั่ง seller.
 */

export type CategoryItem = { id: string; name: string }

export type AuctionCard = {
  id: string
  title: string
  image: string
  currentPrice: number
  bidCount: number
}

// สีตาม SSOT getTierColor (@/lib/trust-tier)
export type TierChipColor = 'secondary' | 'info' | 'warning' | 'default'

export type TrustedShopCard = {
  username: string
  shopName: string
  image: string | null
  trustScore: number
  tierLabel: string
  tierColor: TierChipColor
  verified: boolean
}

type Props = {
  stats: { shops: number; orders: number; scamReports: number }
  categories: CategoryItem[]
  hotAuctions: AuctionCard[]
  endingAuctions: AuctionCard[]
  pastAuctions: AuctionCard[]
  trustedShops: TrustedShopCard[]
}

const nf = new Intl.NumberFormat('th-TH')

const baht = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 })

const CAT_ICON: Record<string, string> = {
  พระเครื่อง: 'tabler-sparkles',
  นาฬิกา: 'tabler-clock-hour-3',
  ของสะสม: 'tabler-diamond',
  กล้อง: 'tabler-camera',
  เหรียญ: 'tabler-coin',
  แสตมป์: 'tabler-mail',
  เครื่องประดับ: 'tabler-diamonds',
  งานศิลปะ: 'tabler-palette',
  เครื่องราง: 'tabler-star',
  ธนบัตร: 'tabler-cash',
  ของเล่นสะสม: 'tabler-mood-smile',
  หนังสือเก่า: 'tabler-book',
  เซรามิก: 'tabler-mug',
  เครื่องดนตรี: 'tabler-music',
  ภาพถ่าย: 'tabler-photo',
  ของโบราณ: 'tabler-building-monument',
}

const SectionHeader = ({ icon, title, href }: { icon: string; title: string; href?: string }) => (
  <div className='flex items-center gap-2'>
    <i className={`${icon} text-[18px] text-[var(--mui-palette-primary-main)]`} />
    <Typography className='font-semibold flex-1'>{title}</Typography>
    {href && (
      <LinkButton href={href} variant='text' size='small' endIcon={<i className='tabler-chevron-right' />}>
        ดูทั้งหมด
      </LinkButton>
    )}
  </div>
)

// carousel ประมูล (ใช้ซ้ำ กำลังประมูล / ใกล้จบ / ผลประมูลล่าสุด)
const AuctionCarousel = ({ icon, title, href, items }: { icon: string; title: string; href?: string; items: AuctionCard[] }) => (
  <div className='flex flex-col gap-3'>
    <SectionHeader icon={icon} title={title} href={href} />
    <div className='flex gap-3 overflow-x-auto pb-1 -mx-1 px-1'>
      {items.map(a => (
        <Link key={a.id} href={`/a/${a.id}`} className='no-underline shrink-0 w-[158px]'>
          <Card className='h-full overflow-hidden transition-shadow hover:shadow-[0_3px_12px_rgb(47_43_61_/_0.14)]'>
            <div className='relative aspect-square bg-[var(--mui-palette-action-hover)]'>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.image} alt={a.title} loading='lazy' className='absolute inset-0 is-full bs-full object-cover' />
              <span className='absolute top-2 inline-start-2'>
                <Chip size='small' color='primary' variant='filled' label={`${a.bidCount} บิด`} />
              </span>
            </div>
            <CardContent className='!p-3 flex flex-col gap-0.5'>
              <Typography variant='body2' className='font-medium line-clamp-1' color='text.primary'>
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
  </div>
)

const STAT_TILES = [
  { key: 'shops', icon: 'tabler-building-store', label: 'ร้านค้า', color: 'primary' },
  { key: 'orders', icon: 'tabler-circle-check', label: 'ออเดอร์สำเร็จ', color: 'success' },
  { key: 'scamReports', icon: 'tabler-shield-search', label: 'รายงานมิจฉาชีพ', color: 'warning' },
] as const

const HomeFeed = ({ stats, categories, hotAuctions, endingAuctions, pastAuctions, trustedShops }: Props) => {
  return (
    <div className='flex flex-col gap-6'>
      {/* ── Hero (gradient ม่วง + brand + สถิติ) ── */}
      <Card
        className='relative overflow-hidden border-0 shadow-[0_6px_20px_rgb(115_103_240_/_0.35)]'
        style={{ background: 'linear-gradient(135deg, #6558E8 0%, #7367F0 55%, #9186F5 100%)' }}
      >
        {/* วงกลมตกแต่งจาง ๆ */}
        <div className='absolute -top-10 -right-8 size-36 rounded-full bg-white/10' />
        <div className='absolute -bottom-12 -left-6 size-28 rounded-full bg-white/5' />
        <CardContent className='relative flex flex-col gap-4'>
          <div>
            <Typography variant='h6' className='font-extrabold text-white'>
              ซื้อขายมั่นใจกับ Deep
            </Typography>
            <Typography variant='body2' className='text-white/85 mbs-0.5'>
              ทุกร้านตรวจสอบได้ · เช็กก่อนโอน กันมิจฉาชีพ
            </Typography>
          </div>
          <div className='flex items-stretch rounded-2xl bg-white/[0.14] plb-3 backdrop-blur-sm'>
            {STAT_TILES.map((s, i) => (
              <div
                key={s.key}
                className={`flex-1 flex flex-col items-center gap-0.5 text-center ${i > 0 ? 'border-l border-white/20' : ''}`}
              >
                <Typography className='font-extrabold leading-none text-white'>{nf.format(stats[s.key])}</Typography>
                <Typography variant='caption' className='text-white/75 leading-tight'>
                  {s.label}
                </Typography>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── เช็กก่อนโอน (signature CTA) ── */}
      <Link href='/check' className='no-underline'>
        <Card className='bg-[var(--mui-palette-primary-lightOpacity)] transition-shadow active:shadow-none hover:shadow-[0_3px_12px_rgb(47_43_61_/_0.14)]'>
          <CardContent className='flex items-center gap-3 !plb-4'>
            <CustomAvatar variant='rounded' color='primary' size={44}>
              <i className='tabler-shield-search text-[24px]' />
            </CustomAvatar>
            <div className='flex flex-col min-w-0 grow'>
              <Typography className='font-semibold' color='text.primary'>
                เช็กก่อนโอน
              </Typography>
              <Typography variant='body2' color='text.secondary' className='truncate'>
                ค้นเบอร์ / บัญชี / ชื่อ ก่อนโอนเงินให้ร้าน
              </Typography>
            </div>
            <i className='tabler-chevron-right text-[22px] text-[var(--mui-palette-primary-main)]' />
          </CardContent>
        </Card>
      </Link>

      {/* ── หมวดหมู่ (2 แถวเลื่อนแนวนอน) ── */}
      {categories.length > 0 && (
        <div className='flex flex-col gap-3'>
          <SectionHeader icon='tabler-layout-grid' title='หมวดหมู่' />
          <div className='grid grid-rows-2 grid-flow-col auto-cols-max gap-x-5 gap-y-4 overflow-x-auto pb-1 -mx-1 px-1'>
            {categories.map(c => (
              <Link
                key={c.id}
                href={`/m/auctions?category=${encodeURIComponent(c.name)}`}
                className='flex flex-col items-center gap-1.5 no-underline text-center w-[60px]'
              >
                <CustomAvatar skin='light' variant='rounded' color='primary' size={52}>
                  <i className={`${CAT_ICON[c.name] ?? 'tabler-tag'} text-[26px]`} />
                </CustomAvatar>
                <span className='text-[11px] leading-tight text-[var(--mui-palette-text-secondary)] line-clamp-1 is-full'>
                  {c.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── กำลังประมูล ── */}
      {hotAuctions.length > 0 && (
        <AuctionCarousel icon='tabler-flame' title='กำลังประมูล' href='/m/auctions' items={hotAuctions} />
      )}

      {/* ── ประมูลใกล้จบ ── */}
      {endingAuctions.length > 0 && (
        <AuctionCarousel icon='tabler-clock-hour-11' title='ใกล้จบแล้ว' href='/m/auctions?sort=ending' items={endingAuctions} />
      )}

      {/* ── ผลประมูลล่าสุด (ปิดแล้ว) ── */}
      {pastAuctions.length > 0 && (
        <AuctionCarousel icon='tabler-gavel' title='ผลประมูลล่าสุด' items={pastAuctions} />
      )}

      {/* ── ร้านน่าเชื่อถือ ── */}
      {trustedShops.length > 0 && (
        <div className='flex flex-col gap-3'>
          <SectionHeader icon='tabler-building-store' title='ร้านน่าเชื่อถือ' href='/m/shops' />
          <div className='flex gap-3 overflow-x-auto pb-1 -mx-1 px-1'>
            {trustedShops.map(s => (
              <Link key={s.username} href={`/u/${s.username}`} className='no-underline shrink-0 w-[132px]'>
                <Card className='h-full transition-shadow hover:shadow-[0_3px_12px_rgb(47_43_61_/_0.14)]'>
                  <CardContent className='flex flex-col items-center gap-2 text-center !p-4'>
                    <CustomAvatar src={s.image ?? undefined} size={56}>
                      {s.shopName.slice(0, 1)}
                    </CustomAvatar>
                    <Typography variant='body2' className='font-medium truncate is-full' color='text.primary'>
                      {s.shopName}
                    </Typography>
                    <Chip size='small' variant='tonal' color={s.tierColor} label={s.tierLabel} />
                    <Typography variant='caption' color='text.disabled'>
                      Trust {s.trustScore}
                    </Typography>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default HomeFeed
