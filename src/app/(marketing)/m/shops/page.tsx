import type { Metadata } from 'next'
import Link from 'next/link'

import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'

import CustomAvatar from '@core/components/mui/Avatar'
import { getTrustedShops } from '@/services/shop.service'
import { getTierDisplay } from '@/services/trust-score.service'
import { getTierColor } from '@/lib/trust-tier'

export const metadata: Metadata = { title: 'ร้านแนะนำ' }

const resolveImg = (u: string) => (u.startsWith('http') ? u : `/api/files/${u}`)

/** ร้านแนะนำทั้งหมด (mobile) — เรียงตาม Trust Score (ความน่าเชื่อถือ/โปรไฟล์) → /u/{username} */
export default async function MobileShopsPage() {
  const rows = await getTrustedShops(30)

  const shops = rows.map(s => {
    const { tier, dots } = getTierDisplay(s.trustScore)
    return {
      username: s.username,
      shopName: s.shops[0]?.shopName ?? s.displayName,
      image: s.shops[0]?.logo ? resolveImg(s.shops[0].logo) : s.avatar,
      trustScore: s.trustScore,
      tier,
      tierColor: getTierColor(s.trustScore),
      dots,
      verified: s.verifications.length > 0,
    }
  })

  return (
    <>
      <Typography variant='h5' className='font-semibold'>
        ร้านแนะนำ
      </Typography>
      <Typography variant='body2' color='text.secondary' className='-mbs-3'>
        เรียงตามความน่าเชื่อถือ · ยืนยันตัวตนแล้ว
      </Typography>

      {shops.length === 0 ? (
        <div className='flex flex-col items-center justify-center gap-3 plb-16 text-center'>
          <CustomAvatar skin='light' variant='rounded' color='secondary' size={52}>
            <i className='tabler-building-store text-[30px]' />
          </CustomAvatar>
          <Typography color='text.secondary'>ยังไม่มีร้านค้า</Typography>
        </div>
      ) : (
        <Card>
          <div className='flex flex-col'>
            {shops.map(s => (
              <Link
                key={s.username}
                href={`/u/${s.username}`}
                className='flex items-center gap-3 pli-4 plb-3 no-underline border-b border-[var(--mui-palette-divider)] last:border-b-0 hover:bg-[var(--mui-palette-action-hover)] transition-colors'
              >
                <CustomAvatar src={s.image ?? undefined} size={48}>
                  {s.shopName.slice(0, 1)}
                </CustomAvatar>
                <div className='flex flex-col min-w-0 grow gap-1'>
                  <div className='flex items-center gap-2'>
                    <Typography className='font-medium truncate' color='text.primary'>
                      {s.shopName}
                    </Typography>
                    {s.verified && (
                      <i className='tabler-shield-check-filled text-[16px] text-[var(--mui-palette-success-main)] shrink-0' />
                    )}
                  </div>
                  <div className='flex items-center gap-2 flex-wrap'>
                    <Chip size='small' variant='tonal' color={s.tierColor} label={s.tier} />
                    <Typography variant='caption' color='text.disabled'>
                      Trust {s.trustScore}
                    </Typography>
                  </div>
                </div>
                <i className='tabler-chevron-right text-[20px] text-[var(--mui-palette-text-disabled)] shrink-0' />
              </Link>
            ))}
          </div>
        </Card>
      )}
    </>
  )
}
