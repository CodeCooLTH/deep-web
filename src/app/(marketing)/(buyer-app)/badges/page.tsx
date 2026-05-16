import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

// MUI Imports (from ActiveProjects theme base)
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import LinearProgress from '@mui/material/LinearProgress'
import Chip from '@mui/material/Chip'

import { Icon } from '@iconify/react'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { getBadgeProgress } from '@/services/badge.service'
import type { BadgeProgress } from '@/types/badge'

/**
 * หน้า Badge Process ของ Buyer — แสดง badge ที่ได้รับแล้ว + กำลังดำเนินการ
 *
 * Base:
 *   theme/vuexy/typescript-version/full-version/src/views/pages/widget-examples/advanced/ActiveProjects.tsx
 * Adapted: Card+CardHeader+CardContent+LinearProgress row structure → badge earned/in-progress
 *   sections; Chip for earned state (ref Courses.tsx); @iconify tabler-award icon (badge.icon
 *   legacy/nullable — not rendered). ตัดออก: OptionMenu, imgSrc, progressColor theme colors.
 */

export const metadata: Metadata = { title: 'แบดจ์ของฉัน' }

export default async function BadgesPage() {
  const session = await getServerSession(authOptions)

  // security must-fix #3: ต้อง redirect พร้อม callbackUrl เพราะ (buyer-app) layout
  // redirect ไม่ส่ง URL กลับ — confirmed pattern จาก reviews/page.tsx
  if (!session?.user) redirect('/auth/sign-in?callbackUrl=/badges')

  const userId = (session.user as { id: string }).id
  const items = await getBadgeProgress(userId, 'BUYER')

  const earned: BadgeProgress[] = items.filter(i => i.earned)
  // in-progress: ยังไม่ได้รับ → เรียงตาม progressRatio มากสุดขึ้นก่อน
  const inProgress: BadgeProgress[] = items
    .filter(i => !i.earned)
    .sort((a, b) => b.progressRatio - a.progressRatio)

  return (
    <>
      {/* Header block — mirrors reviews/page.tsx lines 55-61 */}
      <div className='flex items-center justify-between gap-3 flex-wrap'>
        <div>
          <Typography variant='h5'>แบดจ์ของฉัน</Typography>
          <Typography color='text.secondary' className='text-sm'>
            ได้รับแล้ว {earned.length} ใบ · กำลังดำเนินการ {inProgress.length} ใบ
          </Typography>
        </div>
      </div>

      {/* Empty state เมื่อไม่มี badge เลย */}
      {items.length === 0 && (
        <Card className='mt-4'>
          <CardContent>
            <Typography color='text.secondary' className='text-center py-6'>
              ยังไม่มีแบดจ์ในระบบ — ลองกลับมาดูอีกครั้งในภายหลัง
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* ─── ส่วนที่ได้รับแล้ว ──────────────────────────────────────── */}
      {earned.length > 0 && (
        <Card className='mt-4'>
          <CardHeader
            title='ได้รับแล้ว'
            subheader={`${earned.length} แบดจ์`}
          />
          {/* โครงสร้าง row จาก ActiveProjects: flex items-center gap-4 → icon + label + chip */}
          <CardContent className='flex flex-col gap-4'>
            {earned.map(item => (
              <div key={item.badge.id} className='flex items-center gap-4'>
                {/* ใช้ tabler-award เป็น generic icon เพราะ badge.icon legacy/nullable */}
                <span className='flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary'>
                  <Icon icon='tabler:award' width={20} height={20} />
                </span>
                <div className='flex flex-wrap justify-between items-center gap-x-4 gap-y-1 is-full'>
                  <div className='flex flex-col'>
                    <Typography className='font-medium' color='text.primary'>
                      {item.badge.name}
                    </Typography>
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
        <Card className='mt-4'>
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
                  <span className='flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary flex-shrink-0'>
                    <Icon icon='tabler:award' width={20} height={20} />
                  </span>
                  <div className='flex flex-wrap justify-between items-center gap-x-4 gap-y-1 is-full'>
                    <div className='flex flex-col'>
                      <Typography className='font-medium' color='text.primary'>
                        {item.badge.name}
                      </Typography>
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
                        className='min-bs-2 flex-1'
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
        <Card className='mt-4'>
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
