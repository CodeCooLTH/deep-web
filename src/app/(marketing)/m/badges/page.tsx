import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { getBadgeProgress, getUserBadgeRarityMap } from '@/services/badge.service'
import BadgeIcon from '@/app/(marketing)/(buyer-app)/_components/BadgeIcon'
import { MPageTitle, MEmpty, MChip, type SemColor } from '../_components/ui'
import { sessionUserId } from '@/lib/session-user'

export const metadata: Metadata = { title: 'ความสำเร็จ' }

const RARITY: Record<string, { label: string; color: SemColor }> = {
  COMMON: { label: 'ทั่วไป', color: 'secondary' },
  UNCOMMON: { label: 'ไม่ทั่วไป', color: 'info' },
  RARE: { label: 'หายาก', color: 'warning' },
  LEGENDARY: { label: 'หายากมาก', color: 'primary' }
}

const SectionLabel = ({ title, count }: { title: string; count: number }) => (
  <div className='flex items-baseline gap-2 mbe-2.5'>
    <h2 className='text-[15px] font-semibold m-0 text-[var(--mui-palette-text-primary)]'>{title}</h2>
    <span className='text-[12px] text-[var(--mui-palette-text-disabled)]'>{count} ใบ</span>
  </div>
)

export default async function MobileBadgesPage() {
  const session = await getServerSession(authOptions)
  const userId = sessionUserId(session)
  if (!session?.user || !userId) redirect('/auth/sign-in?callbackUrl=/badges')

  const items = await getBadgeProgress(userId, 'BUYER')
  const rarityMap = await getUserBadgeRarityMap(items.map(i => i.badge.id))

  const earned = items.filter(i => i.earned)
  const inProgress = items.filter(i => !i.earned).sort((a, b) => b.progressRatio - a.progressRatio)

  return (
    <div className='flex flex-col gap-5'>
      <div>
        <MPageTitle title='ความสำเร็จ' back='/settings/profile' />
        <p className='text-[13px] m-0 mbs-0.5 text-[var(--mui-palette-text-secondary)]'>
          ได้รับแล้ว {earned.length} ใบ · กำลังดำเนินการ {inProgress.length} ใบ
        </p>
      </div>

      {items.length === 0 ? (
        <MEmpty icon='tabler-award' text='ยังไม่มีความสำเร็จ' hint='ทำกิจกรรมในระบบเพื่อปลดล็อกแบดจ์' />
      ) : (
        <>
          {/* ── ได้รับแล้ว (grid) ── */}
          {earned.length > 0 && (
            <section>
              <SectionLabel title='ได้รับแล้ว' count={earned.length} />
              <div className='grid grid-cols-3 gap-2.5'>
                {earned.map(i => {
                  const rarity = rarityMap.get(i.badge.id)
                  return (
                    <div
                      key={i.badge.id}
                      className='rounded-2xl bg-[var(--mui-palette-background-paper)] border border-[var(--mui-palette-divider)] flex flex-col items-center gap-1.5 text-center p-5'
                    >
                      <div className='size-14 rounded-full bg-[var(--mui-palette-primary-lightOpacity)] flex items-center justify-center'>
                        <BadgeIcon imageUrl={i.badge.imageUrl} nameEN={i.badge.nameEN} icon={i.badge.icon} size={30} alt={i.badge.name} />
                      </div>
                      <span className='text-[11px] font-medium leading-tight line-clamp-2 text-[var(--mui-palette-text-primary)]'>
                        {i.badge.name}
                      </span>
                      {rarity && RARITY[rarity] && <MChip label={RARITY[rarity].label} color={RARITY[rarity].color} />}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* ── กำลังดำเนินการ (list + progress) ── */}
          {inProgress.length > 0 && (
            <section>
              <SectionLabel title='กำลังดำเนินการ' count={inProgress.length} />
              <div className='flex flex-col gap-2.5'>
                {inProgress.map(i => {
                  const pct = Math.round(i.progressRatio * 100)
                  return (
                    <div
                      key={i.badge.id}
                      className='rounded-2xl bg-[var(--mui-palette-background-paper)] border border-[var(--mui-palette-divider)] flex items-center gap-3 p-5'
                    >
                      <div className='size-11 rounded-full bg-[var(--mui-palette-action-hover)] flex items-center justify-center shrink-0'>
                        <BadgeIcon imageUrl={i.badge.imageUrl} nameEN={i.badge.nameEN} icon={i.badge.icon} size={24} alt={i.badge.name} />
                      </div>
                      <div className='flex-1 min-w-0'>
                        <div className='flex items-center justify-between gap-2'>
                          <span className='text-[13px] font-medium truncate text-[var(--mui-palette-text-primary)]'>{i.badge.name}</span>
                          <span className='text-[11px] text-[var(--mui-palette-text-secondary)] shrink-0'>{pct}%</span>
                        </div>
                        {i.progressLabel && (
                          <p className='text-[11px] m-0 text-[var(--mui-palette-text-disabled)] truncate'>{i.progressLabel}</p>
                        )}
                        <div className='mbs-1.5 h-1.5 rounded-full bg-[var(--mui-palette-action-hover)] overflow-hidden'>
                          <div className='h-full rounded-full bg-[var(--mui-palette-primary-main)]' style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
