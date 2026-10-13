'use client'

// MUI Imports
import Typography from '@mui/material/Typography'

// Third-party Imports
import classnames from 'classnames'

// Component Imports
import { SqueezeCarousel, type SqueezeSlide } from '@/components/ui/carousel-squeeze'
import CustomAvatar from '@core/components/mui/Avatar'
import ScamSearchBar from '@views/front-pages/scam-check/ScamSearchBar'

// Util Imports
import { getTierChipTone, getTierGradient } from '@/lib/trust-tier'

// Styles Imports
import frontCommonStyles from '@views/front-pages/styles.module.css'

/**
 * การ์ดร้านบนหน้าแรก — ข้อมูลจริงจาก DB ทั้งหมด (getTrustedShops → page.tsx) ไม่มีตัวเลขสมมติ
 * (PRODUCT.md §Evidence on Hand: ห้ามแต่งตัวเลข/social proof)
 */
export type LandingShop = {
  username: string
  shopName: string
  image: string | null
  trustScore: number
  /** ชื่อ tier จาก getTierDisplay() — SSOT `docs/10 - Business Rules/Tier Lists.md` */
  tierLabel: string
  verified: boolean
  /** ออเดอร์ CONFIRMED (ดีลสำเร็จจริง) */
  deals: number
}

/**
 * ร้านที่ดีลจบจริงยังไม่ถึง 3 รายการ = "ร้านใหม่" → พื้นเทา (ภาพเดียวกับ Deep Classic 0–39)
 * ไม่ว่าคะแนนจะเท่าไร — กติกาเดียวกับปกโปรไฟล์ (UserProfileHeader `isNewShop`): คะแนนดันด้วยรีวิวได้
 * แต่ออเดอร์ที่จบจริงปลอมยากกว่า ⇒ ร้านที่ยังไม่พิสูจน์ตัวต้องไม่หน้าตาเหมือนได้รางวัล
 */
const NEW_SHOP_MIN_DEALS = 3

const toSlide = (s: LandingShop): SqueezeSlide => {
  const isNewShop = s.deals < NEW_SHOP_MIN_DEALS
  const tone = getTierChipTone(s.trustScore)

  const facts = [
    `Trust Score ${s.trustScore}/100`,
    s.tierLabel,
    s.verified ? 'ยืนยันตัวตนแล้ว' : 'ยังไม่ยืนยันตัวตน',
    s.deals > 0 ? `${s.deals} ดีลสำเร็จ` : 'ร้านใหม่'
  ]

  return {
    id: s.username,
    title: s.shopName,
    description: facts.join(' · '),
    background: getTierGradient(isNewShop ? 0 : s.trustScore),
    action: 'ดูโปรไฟล์ร้าน',
    href: `/u/${s.username}`,
    overlay: (
      <span className='flex is-full items-end justify-between gap-3'>
        <span className='flex min-is-0 items-center gap-3'>
          <CustomAvatar src={s.image ?? undefined} size={44} className='shrink-0 border-2 border-white'>
            {s.shopName.slice(0, 1)}
          </CustomAvatar>
          <span className='flex min-is-0 flex-col'>
            <span className='truncate text-[1.125rem] font-medium leading-[1.556] text-white'>{s.shopName}</span>
            {s.verified && (
              <span className='inline-flex items-center gap-1 text-[0.8125rem] font-medium text-white'>
                <i className='tabler-rosette-discount-check-filled text-base' />
                ยืนยันตัวตนแล้ว
              </span>
            )}
          </span>
        </span>
        {/* พื้นขาวทึบ + สีหมึกจาก getTierChipTone — หมึกชุดนี้คำนวณไว้บนพื้นขาว (≥4.79:1) */}
        <span
          className='inline-flex shrink-0 items-baseline gap-1.5 rounded-full bg-white pli-3 plb-1.5'
          style={{ color: tone.text }}
        >
          <span className='text-[1.375rem] font-extrabold leading-none tabular-nums'>{s.trustScore}</span>
          <span className='text-[0.8125rem] font-medium'>{s.tierLabel.replace('Deep ', '')}</span>
        </span>
      </span>
    )
  }
}

const TrustSearchHero = ({ shops }: { shops: LandingShop[] }) => {
  return (
    // pbs/−mbs 75px = ความสูง header ที่ลอยทับ (แบบเดียวกับ HeroSection เดิม)
    <section id='home' className='pbs-[75px] -mbs-[75px] bg-backgroundDefault'>
      <div className={classnames('flex flex-col gap-10 pbs-12 pbe-12 md:pbs-20 md:pbe-20', frontCommonStyles.layoutSpacing)}>
        <div id='check' className='flex flex-col gap-6'>
          <div className='flex flex-col items-center gap-2 text-center'>
            {/* มือถือ = headline 28px · จอกว้าง = display 46px (ramp buyer, DESIGN.md §Typography) */}
            <Typography
              variant='h1'
              color='text.primary'
              className='text-[1.75rem] leading-[1.5] md:text-[2.875rem] md:leading-[1.478] text-balance'
            >
              เช็กก่อนโอน ซื้อขายออนไลน์อย่างอุ่นใจ
            </Typography>
            <Typography className='max-is-[560px]'>
              ค้นด้วยเบอร์ ชื่อ เลขบัตรประชาชน หรือเลขบัญชี — เราแสดงแค่จำนวนครั้งที่ถูกรายงาน (ที่ตรวจสอบแล้ว)
              ไม่ตัดสิน ไม่เปิดเผยตัวบุคคล
            </Typography>
          </div>
          <ScamSearchBar />
        </div>

        {shops.length > 0 && (
          <div className='flex flex-col gap-2'>
            <div className='flex flex-col gap-1'>
              <Typography variant='h4' color='text.primary'>
                ร้านที่ใช้ Deep
              </Typography>
              <Typography>เรียงตาม Trust Score — คะแนนคำนวณจากการยืนยันตัวตน ออเดอร์ เรตติ้ง อายุบัญชี และ Badge</Typography>
            </div>
            <SqueezeCarousel
              slides={shops.map(toSlide)}
              label='ร้านที่ใช้ Deep'
              previousLabel='ร้านก่อนหน้า'
              nextLabel='ร้านถัดไป'
              height='clamp(200px, 32cqi, 340px)'
              // ไทล์ = ภาชนะ ⇒ 12px ตามบันได buyer (DESIGN.md §Shapes)
              radius={12}
            />
          </div>
        )}
      </div>
    </section>
  )
}

export default TrustSearchHero
