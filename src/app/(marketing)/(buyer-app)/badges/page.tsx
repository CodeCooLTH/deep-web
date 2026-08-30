import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

// MUI Imports (from ActiveProjects theme base)
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import LinearProgress from '@mui/material/LinearProgress'
import Chip from '@mui/material/Chip'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { getBadgeProgress, getUserBadgeRarityMap } from '@/services/badge.service'
import type { RarityTier } from '@/services/badge.service'
import type { BadgeProgress } from '@/types/badge'
import BadgeIcon from '@/app/(marketing)/(buyer-app)/_components/BadgeIcon'
import PageHeader from '@/app/(marketing)/(buyer-app)/_components/PageHeader'
import { sessionUserId } from '@/lib/session-user'

// ─── Rarity pill config (safepay-ux Design Spec 2026-07-02) ──
// label ไทย + สี MUI ต่อ tier; เลี่ยง success (ชนกับ chip "ได้รับแล้ว") + error (สื่อ error)
const RARITY_LABEL: Record<RarityTier, string> = {
  COMMON: 'ทั่วไป',
  UNCOMMON: 'ไม่ทั่วไป',
  RARE: 'หายาก',
  LEGENDARY: 'หายากมาก',
}
const RARITY_COLOR: Record<RarityTier, 'secondary' | 'info' | 'warning' | 'primary'> = {
  COMMON: 'secondary',
  UNCOMMON: 'info',
  RARE: 'warning',
  LEGENDARY: 'primary',
}

/**
 * หน้า Badge Process ของ Buyer — แสดง badge ที่ได้รับแล้ว + กำลังดำเนินการ
 *
 * Base:
 *   theme/vuexy/typescript-version/full-version/src/views/pages/widget-examples/advanced/ActiveProjects.tsx
 * Base (rarity pill): theme/vuexy/typescript-version/full-version/src/views/apps/academy/my-courses/Courses.tsx
 *   — chipColor object pattern + <Chip variant='tonal' size='small' color={...}> (safepay-ux 2026-07-02)
 * Adapted: Card+CardHeader+CardContent+LinearProgress row structure → badge earned/in-progress
 *   sections; Chip for earned state (ref Courses.tsx); rarity pill inline ข้างชื่อ badge (tier→color
 *   secondary/info/warning/primary); @iconify tabler-award icon (badge.icon legacy/nullable — not
 *   rendered). ตัดออก: OptionMenu, imgSrc, progressColor theme colors.
 */

export const metadata: Metadata = { title: 'ความสำเร็จ' }

export default async function BadgesPage() {
  const session = await getServerSession(authOptions)

  // security must-fix #3: ต้อง redirect พร้อม callbackUrl เพราะ (buyer-app) layout
  // redirect ไม่ส่ง URL กลับ — confirmed pattern จาก reviews/page.tsx
  const userId = sessionUserId(session)
  if (!session?.user || !userId) redirect('/auth/sign-in?callbackUrl=/badges')

  const items = await getBadgeProgress(userId, 'BUYER')

  // rarity pill — ฐาน user count (gate <20 → Map ว่าง = ไม่แสดง); badgeId ที่ไม่มีใน map = ไม่มี pill
  const rarityMap = await getUserBadgeRarityMap(items.map(i => i.badge.id))

  // ชื่อ badge + rarity pill inline (flex-wrap → pill ตกบรรทัดใหม่ถ้าชื่อยาว); ไม่มี tier = ชื่อเดี่ยว
  const nameWithRarity = (item: BadgeProgress) => {
    const tier = rarityMap.get(item.badge.id)
    return (
      <div className='flex items-center gap-2 flex-wrap'>
        <Typography className='font-medium' color='text.primary'>
          {item.badge.name}
        </Typography>
        {tier && (
          <Chip label={RARITY_LABEL[tier]} variant='tonal' size='small' color={RARITY_COLOR[tier]} />
        )}
      </div>
    )
  }

  const earned: BadgeProgress[] = items.filter(i => i.earned)
  // in-progress: ยังไม่ได้รับ → เรียงตาม progressRatio มากสุดขึ้นก่อน
  const inProgress: BadgeProgress[] = items
    .filter(i => !i.earned)
    .sort((a, b) => b.progressRatio - a.progressRatio)

  return (
    <>
      <PageHeader
        title='ความสำเร็จ'
        subtitle={`ได้รับแล้ว ${earned.length} ใบ · กำลังดำเนินการ ${inProgress.length} ใบ`}
      />

      {/* Empty state เมื่อไม่มี badge เลย */}
      {items.length === 0 && (
        <Card>
          <CardContent>
            <Typography color='text.secondary' className='text-center py-6'>
              ยังไม่มีแบดจ์ในระบบ — ลองกลับมาดูอีกครั้งในภายหลัง
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* ─── ส่วนที่ได้รับแล้ว ──────────────────────────────────────── */}
      {earned.length > 0 && (
        <Card>
          <CardHeader
            title='ได้รับแล้ว'
            subheader={`${earned.length} แบดจ์`}
          />
          {/* โครงสร้าง row จาก ActiveProjects: flex items-center gap-4 → icon + label + chip */}
          <CardContent className='flex flex-col gap-4'>
            {earned.map(item => (
              <div key={item.badge.id} className='flex items-center gap-4'>
                {/* icon circle ขนาด w-8 h-8 — เท่ากับ theme เดิม; img แทน tabler:award ขนาด 20px เท่าเดิม */}
                <span className='flex items-center justify-center w-8 h-8 rounded-full bg-[var(--mui-palette-primary-lightOpacity)] text-[var(--mui-palette-primary-main)] flex-shrink-0'>
                  <BadgeIcon imageUrl={item.badge.imageUrl} nameEN={item.badge.nameEN} icon={item.badge.icon} size={20} alt={item.badge.name} />
                </span>
                <div className='flex flex-wrap justify-between items-center gap-x-4 gap-y-1 is-full'>
                  <div className='flex flex-col'>
                    {nameWithRarity(item)}
                    {item.progressLabel && (
                      <Typography variant='body2' color='text.secondary'>
                        {item.progressLabel}
                      </Typography>
                    )}
                  </div>
                  {/* Chip style ref จาก Courses.tsx line 133 */}
                  <Chip label='ได้รับแล้ว' variant='tonal' size='small' color='success' />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ─── ส่วนกำลังดำเนินการ ──────────────────────────────────────── */}
      {inProgress.length > 0 && (
        <Card>
          <CardHeader
            title='กำลังดำเนินการ'
            subheader={`${inProgress.length} แบดจ์`}
          />
          {/* row structure from ActiveProjects: icon + label left / progressBar + % right */}
          <CardContent className='flex flex-col gap-4'>
            {inProgress.map(item => {
              // แปลง 0–1 ratio เป็น % integer สำหรับ LinearProgress + label
              const pct = Math.round(item.progressRatio * 100)
              return (
                <div key={item.badge.id} className='flex items-center gap-4'>
                  {/* icon circle ขนาด w-8 h-8 — เท่ากับ theme เดิม; img แทน tabler:award ขนาด 20px เท่าเดิม */}
                  <span className='flex items-center justify-center w-8 h-8 rounded-full bg-[var(--mui-palette-primary-lightOpacity)] text-[var(--mui-palette-primary-main)] flex-shrink-0'>
                    <BadgeIcon imageUrl={item.badge.imageUrl} nameEN={item.badge.nameEN} icon={item.badge.icon} size={20} alt={item.badge.name} />
                  </span>
                  <div className='flex flex-wrap justify-between items-center gap-x-4 gap-y-1 is-full'>
                    <div className='flex flex-col'>
                      {nameWithRarity(item)}
                      {item.progressLabel && (
                        <Typography variant='body2' color='text.secondary'>
                          {item.progressLabel}
                        </Typography>
                      )}
                    </div>
                    {/* progressBar + % — mirrors ActiveProjects lines 86-94 (deterministic value) */}
                    <div className='flex justify-between items-center gap-2 min-w-[8rem]'>
                      <LinearProgress
                        value={pct}
                        variant='determinate'
                        color='primary'
                        className='min-bs-2 flex-1' /* carve-out tap: รางความคืบหน้า กดไม่ได้ ไม่ใช่เป้าให้นิ้ว */
                      />
                      <Typography color='text.disabled' className='text-xs whitespace-nowrap'>
                        {`${pct}%`}
                      </Typography>
                    </div>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Empty state เฉพาะส่วน in-progress (มี badge แต่ได้ครบหมดแล้ว) */}
      {items.length > 0 && inProgress.length === 0 && (
        <Card>
          <CardContent>
            <Typography color='text.secondary' className='text-center py-4'>
              คุณได้รับทุกแบดจ์ที่มีอยู่แล้ว — ยอดเยี่ยมมาก!
            </Typography>
          </CardContent>
        </Card>
      )}
    </>
  )
}
