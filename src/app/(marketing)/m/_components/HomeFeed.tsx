// Next Imports
import Link from 'next/link'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'
import BannerCarousel from './BannerCarousel'

/**
 * หน้าแรก mobile web app (/m) — ดีไซน์แนว Shopee: minimal, สะอาด, การ์ดมนบางขอบจาง,
 * 2-column feed + strip แนวนอน. ม่วงเป็น accent เฉพาะราคา/CTA. Server component ล้วน (raw HTML → เบา).
 */

// หมวดหมู่สินค้า — imageUrl = รูปสินค้าจริง (resolved แล้ว) หรือ '' (fallback ไอคอน)
export type CategoryItem = { name: string; imageUrl: string }

export type AuctionCard = {
  id: string
  title: string
  image: string
  currentPrice: number
  bidCount: number
  // seller trust (โชว์บนการ์ด — buyer เห็นความน่าเชื่อถือผู้ขายตอนบิด)
  sellerTier?: string
  sellerTierColor?: TierChipColor
  sellerVerified?: boolean
}

export type TierChipColor = 'secondary' | 'info' | 'warning' | 'default'

export type TrustedShopCard = {
  username: string
  shopName: string
  image: string | null
  trustScore: number
  tierLabel: string
  tierColor: TierChipColor
  dots: number
  deals: number
  verified: boolean
}

type Props = {
  categories: CategoryItem[]
  hotAuctions: AuctionCard[]
  pastAuctions: AuctionCard[]
  trustedShops: TrustedShopCard[]
}

const baht = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 })

// ซ่อน native scrollbar ของ strip แนวนอน (เดิมแถบเทาโผล่ทับใต้การ์ด)
const NO_SCROLLBAR = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

// ไอคอน fallback ต่อหมวดสินค้า (ใช้เมื่อหมวดนั้นยังไม่มีรูปสินค้าจริง)
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
  ของโบราณ: 'tabler-building-monument'
}

const tierBg = (c: TierChipColor) =>
  c === 'default' ? 'var(--mui-palette-action-selected)' : `var(--mui-palette-${c}-lightOpacity)`
const tierFg = (c: TierChipColor) =>
  c === 'default' ? 'var(--mui-palette-text-secondary)' : `var(--mui-palette-${c}-main)`

const SectionTitle = ({ title, href }: { title: string; href?: string }) => (
  <div className='flex items-center justify-between mbe-2.5'>
    <h2 className='text-[15px] font-semibold m-0 text-[var(--mui-palette-text-primary)]'>{title}</h2>
    {href && (
      <Link
        href={href}
        className='text-[13px] text-[var(--mui-palette-text-secondary)] no-underline flex items-center gap-0.5'
      >
        ดูทั้งหมด
        <i className='tabler-chevron-right text-[15px]' />
      </Link>
    )}
  </div>
)

// การ์ดประมูล — minimal (รูป square + ชื่อ 2 บรรทัด + ราคา + จำนวนบิด)
const AuctionMiniCard = ({ a }: { a: AuctionCard }) => (
  <Link href={`/a/${a.id}`} className='no-underline block'>
    <div className='rounded-2xl overflow-hidden bg-[var(--mui-palette-background-paper)] border border-[var(--mui-palette-divider)]'>
      <div className='relative aspect-square bg-[var(--mui-palette-action-hover)]'>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={a.image} alt={a.title} loading='lazy' className='absolute inset-0 is-full bs-full object-cover' />
      </div>
      <div className='p-2.5 flex flex-col gap-1'>
        <p className='text-[13px] leading-tight line-clamp-2 m-0 text-[var(--mui-palette-text-primary)]'>{a.title}</p>
        {/* seller trust — ความน่าเชื่อถือผู้ขาย */}
        {a.sellerTier && a.sellerTierColor && (
          <div className='flex items-center gap-1'>
            <span
              className='inline-flex items-center gap-0.5 text-[9px] font-semibold leading-none pli-1.5 plb-0.5 rounded-full'
              style={{ background: tierBg(a.sellerTierColor), color: tierFg(a.sellerTierColor) }}
            >
              <i className='tabler-shield-check-filled text-[10px]' />
              {a.sellerTier}
            </span>
            {a.sellerVerified && (
              <i className='tabler-rosette-discount-check-filled text-[11px] text-[var(--mui-palette-success-main)]' />
            )}
          </div>
        )}
        <div className='flex items-baseline justify-between gap-1'>
          <span className='text-[15px] font-bold text-[var(--mui-palette-primary-main)]'>{baht.format(a.currentPrice)}</span>
          <span className='text-[11px] text-[var(--mui-palette-text-disabled)]'>{a.bidCount} บิด</span>
        </div>
      </div>
    </div>
  </Link>
)

// strip ประมูลแนวนอน (ใช้ซ้ำ กำลังประมูล / ใกล้จบ)
const AuctionStrip = ({ title, href, items }: { title: string; href?: string; items: AuctionCard[] }) => (
  <div>
    <SectionTitle title={title} href={href} />
    <div className={`flex gap-2.5 overflow-x-auto -mx-4 px-4 ${NO_SCROLLBAR}`}>
      {items.map(a => (
        <div key={a.id} className='w-[150px] shrink-0'>
          <AuctionMiniCard a={a} />
        </div>
      ))}
    </div>
  </div>
)

const HomeFeed = ({ categories, hotAuctions, pastAuctions, trustedShops }: Props) => {
  return (
    <div className='flex flex-col gap-6'>
      {/* ── Banner โปรโมชั่น (เลื่อนได้) ── */}
      <BannerCarousel />

      {/* ── ร้านความน่าเชื่อถือ (แรกสุด — เลเวล/คะแนน/ดีลจริง) ── */}
      {trustedShops.length > 0 && (
        <div>
          <div className='flex items-center justify-between mbe-0.5'>
            <h2 className='text-[15px] font-semibold m-0 text-[var(--mui-palette-text-primary)]'>ร้านความน่าเชื่อถือ</h2>
            <Link
              href='/m/shops'
              className='text-[13px] text-[var(--mui-palette-text-secondary)] no-underline flex items-center gap-0.5'
            >
              ดูทั้งหมด
              <i className='tabler-chevron-right text-[15px]' />
            </Link>
          </div>
          <p className='text-[12px] m-0 mbe-2.5 text-[var(--mui-palette-text-secondary)]'>เรียงตามเลเวล · ยืนยันตัวตน · ซื้อขายจริง</p>
          <div className={`flex gap-2.5 overflow-x-auto -mx-4 px-4 ${NO_SCROLLBAR}`}>
            {trustedShops.map(s => (
              <Link key={s.username} href={`/u/${s.username}`} className='no-underline shrink-0 w-[136px]'>
                <div className='rounded-2xl bg-[var(--mui-palette-background-paper)] border border-[var(--mui-palette-divider)] p-3 flex flex-col items-center gap-1.5 text-center'>
                  {/* avatar + วงแหวนสี tier + verified */}
                  <div className='relative rounded-full p-[2.5px]' style={{ background: tierFg(s.tierColor) }}>
                    <div className='rounded-full p-[2px] bg-[var(--mui-palette-background-paper)]'>
                      <CustomAvatar src={s.image ?? undefined} size={48}>
                        {s.shopName.slice(0, 1)}
                      </CustomAvatar>
                    </div>
                    {s.verified && (
                      <i className='tabler-rosette-discount-check-filled text-[16px] text-[var(--mui-palette-success-main)] absolute -bottom-0.5 -right-0.5 bg-[var(--mui-palette-background-paper)] rounded-full' />
                    )}
                  </div>
                  <p className='text-[12px] font-medium truncate is-full m-0 text-[var(--mui-palette-text-primary)]'>{s.shopName}</p>
                  {/* คะแนน + tier */}
                  <span
                    className='inline-flex items-center gap-1 pli-2 plb-1 rounded-full leading-none'
                    style={{ background: tierBg(s.tierColor), color: tierFg(s.tierColor) }}
                  >
                    <i className='tabler-shield-check-filled text-[13px]' />
                    <span className='text-[13px] font-extrabold'>{s.trustScore}</span>
                    <span className='text-[9px] font-semibold'>{s.tierLabel.replace('Deep ', '')}</span>
                  </span>
                  {/* เลเวล (dots 1-5) */}
                  <span className='flex items-center gap-0.5'>
                    {[1, 2, 3, 4, 5].map(i => (
                      <span
                        key={i}
                        className='inline-block size-1.5 rounded-full'
                        style={{ background: i <= s.dots ? tierFg(s.tierColor) : 'var(--mui-palette-action-disabledBackground)' }}
                      />
                    ))}
                  </span>
                  {/* ดีลจริง (ซื้อขายสำเร็จ) */}
                  <span className='text-[10px] leading-none text-[var(--mui-palette-text-disabled)]'>
                    {s.deals > 0 ? `${s.deals} ดีลสำเร็จ` : 'ร้านใหม่'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── เช็กก่อนโอน (signature bar) ── */}
      <Link href='/check' className='no-underline block'>
        <div className='flex items-center gap-3 rounded-2xl bg-[var(--mui-palette-background-paper)] border border-[var(--mui-palette-divider)] p-3'>
          <div className='size-9 rounded-xl bg-[var(--mui-palette-primary-main)] flex items-center justify-center shrink-0'>
            <i className='tabler-shield-search text-[20px] text-white' />
          </div>
          <div className='flex-1 min-w-0'>
            <p className='text-[14px] font-semibold m-0 text-[var(--mui-palette-text-primary)]'>เช็กก่อนโอน</p>
            <p className='text-[12px] m-0 text-[var(--mui-palette-text-secondary)] truncate'>
              ค้นเบอร์ / บัญชี / ชื่อ ก่อนโอนเงินให้ร้าน
            </p>
          </div>
          <i className='tabler-chevron-right text-[20px] text-[var(--mui-palette-primary-main)] shrink-0' />
        </div>
      </Link>

      {/* ── หมวดหมู่สินค้า (รูปสินค้าจริง — คลิกดูรายการในหมวด) ── */}
      {categories.length > 0 && (
        <div>
          <SectionTitle title='หมวดหมู่สินค้า' href='/m/auctions' />
          <div className={`grid grid-rows-2 grid-flow-col auto-cols-max gap-x-4 gap-y-3 overflow-x-auto -mx-4 px-4 ${NO_SCROLLBAR}`}>
            {categories.map(c => (
              <Link
                key={c.name}
                href={`/m/auctions?category=${encodeURIComponent(c.name)}`}
                className='flex flex-col items-center gap-1 no-underline w-[58px]'
              >
                {/* รูปสินค้าจริงในหมวด (fallback ไอคอนถ้ายังไม่มีของ) */}
                <div className='size-12 rounded-2xl overflow-hidden bg-[var(--mui-palette-primary-lightOpacity)] flex items-center justify-center'>
                  {c.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.imageUrl} alt={c.name} loading='lazy' className='is-full bs-full object-cover' />
                  ) : (
                    <i className={`${CAT_ICON[c.name] ?? 'tabler-tag'} text-[22px] text-[var(--mui-palette-primary-main)]`} />
                  )}
                </div>
                <span className='text-[11px] text-center leading-tight line-clamp-1 is-full text-[var(--mui-palette-text-secondary)]'>
                  {c.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── กำลังประมูล (live) ── */}
      {hotAuctions.length > 0 && <AuctionStrip title='กำลังประมูล' href='/m/auctions' items={hotAuctions} />}

      {/* ── ประมูลล่าสุด (2-col feed หลัก) ── */}
      {pastAuctions.length > 0 && (
        <div>
          <SectionTitle title='ประมูลล่าสุด' href='/m/auctions' />
          <div className='grid grid-cols-2 gap-2.5'>
            {pastAuctions.map(a => (
              <AuctionMiniCard key={a.id} a={a} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default HomeFeed
