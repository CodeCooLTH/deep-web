import type { Metadata } from 'next'
import Link from 'next/link'

import CustomAvatar from '@core/components/mui/Avatar'
import { getTrustedShops } from '@/services/shop.service'
import { getTierDisplay } from '@/services/trust-score.service'
import { getTierColor } from '@/lib/trust-tier'
import type { TierChipColor } from '@/lib/trust-tier'
import { MPageTitle, MEmpty } from '../_components/ui'

export const metadata: Metadata = { title: 'ร้านแนะนำ' }

const resolveImg = (u: string) => (u.startsWith('http') ? u : `/api/files/${u}`)
const tierBg = (c: TierChipColor) =>
  c === 'default' ? 'var(--mui-palette-action-selected)' : `var(--mui-palette-${c}-lightOpacity)`
const tierFg = (c: TierChipColor) =>
  c === 'default' ? 'var(--mui-palette-text-secondary)' : `var(--mui-palette-${c}-main)`

/** ร้านแนะนำทั้งหมด (mobile) — เรียงตาม Trust Score → /u/{username} */
export default async function MobileShopsPage() {
  const rows = await getTrustedShops(30)

  const shops = rows.map(s => ({
    username: s.username,
    shopName: s.shops[0]?.shopName ?? s.displayName,
    image: s.shops[0]?.logo ? resolveImg(s.shops[0].logo) : s.avatar,
    trustScore: s.trustScore,
    tier: getTierDisplay(s.trustScore).tier,
    tierColor: getTierColor(s.trustScore),
    verified: s.verifications.length > 0
  }))

  return (
    <div className='flex flex-col gap-4'>
      <div>
        <MPageTitle title='ร้านแนะนำ' back='/dashboard' />
        <p className='text-[13px] m-0 mbs-0.5 pli-9 text-[var(--mui-palette-text-secondary)]'>
          เรียงตามความน่าเชื่อถือ · ยืนยันตัวตนแล้ว
        </p>
      </div>

      {shops.length === 0 ? (
        <MEmpty icon='tabler-building-store' text='ยังไม่มีร้านค้า' />
      ) : (
        <div className='flex flex-col gap-2.5'>
          {shops.map(s => (
            <Link
              key={s.username}
              href={`/u/${s.username}`}
              className='no-underline rounded-2xl bg-[var(--mui-palette-background-paper)] border border-[var(--mui-palette-divider)] p-3 flex items-center gap-3'
            >
              <CustomAvatar src={s.image ?? undefined} size={48}>
                {s.shopName.slice(0, 1)}
              </CustomAvatar>
              <div className='flex-1 min-w-0 flex flex-col gap-1'>
                <div className='flex items-center gap-1.5 min-w-0'>
                  <span className='text-[14px] font-medium truncate text-[var(--mui-palette-text-primary)]'>{s.shopName}</span>
                  {s.verified && (
                    <i className='tabler-rosette-discount-check-filled text-[15px] text-[var(--mui-palette-success-main)] shrink-0' />
                  )}
                </div>
                <div className='flex items-center gap-2'>
                  <span
                    className='text-[10px] font-medium leading-none pli-2 plb-1 rounded-full'
                    style={{ background: tierBg(s.tierColor), color: tierFg(s.tierColor) }}
                  >
                    {s.tier}
                  </span>
                  <span className='text-[11px] text-[var(--mui-palette-text-disabled)]'>Trust {s.trustScore}</span>
                </div>
              </div>
              <i className='tabler-chevron-right text-[20px] text-[var(--mui-palette-text-disabled)] shrink-0' />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
