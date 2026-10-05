/**
 * NextActionShell — เปลือกการ์ด "ขั้นถัดไป" ของผู้ซื้อ (00068 UX §2): หัวเรื่อง + ป้าย + เนื้อ
 *
 * แยกไฟล์จาก NextActionCard เพราะกล่องย่อยทุกตัว import เปลือกนี้ ถ้าอยู่ใน NextActionCard จะ import วน
 *
 * - `hero`  = ใบเด่นของหน้า: เงา md · หัวเรื่อง h2 1.5rem/700 (ข้อความใหญ่สุดของหน้า) · มีแถบ "แจ้งปัญหาแล้ว"
 * - `follow` = การ์ดตามติด: เงา sm · หัวข้อ `SectionTitle` ปกติ (ห้ามแย่งความเด่นจาก hero)
 * ห้าม border-left สี/ไล่สี/เขียว (ยังไม่มีสิ่งใดถูกยืนยัน) · การ์ดย่อยห้ามถือ `order:` เอง — shell ของหน้าเป็นเจ้าของ slot
 *
 * Base: ./PayoutAccountCard.tsx (`<Card>` + หัวข้อ) · ./SectionTitle.tsx — ใช้ Card ของธีมตรง ๆ ไม่ใส่คลาสรัศมีทับ
 */

import type { ReactNode } from 'react'

import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import { VERIFY_BADGE_PALETTE } from '@/lib/verify-badge'
import { formatDateTimeTH } from '@/lib/format-date'
import { cardBodySx } from './card-padding'
import SectionTitle from './SectionTitle'
import TrustPill from './TrustPill'

type Props = {
  emphasis: 'hero' | 'follow'
  title: string
  /** ไอคอนหน้าหัวเรื่อง — hero ใช้เฉพาะสถานะที่ต้องสะดุดตา (เช่น ร้านยังไม่แจ้งบัญชี) */
  icon?: string
  /** สีไอคอน — ค่าตั้งต้น = หมึก warning · สถานะที่ห้ามเขียว/เตือน (เช่น ร้านมอบของแล้ว) ส่งสีกลางมา */
  iconColor?: string
  /** ป้ายสถานะข้างหัวเรื่อง — null = ซ้ำกับหัวเรื่องแล้ว ไม่แสดง */
  pill?: string | null
  /** ISO — มีค่า = ผู้ซื้อแจ้งปัญหาแล้ว แสดงแถบใน hero (AC-BOP-04-1 ห้ามมีอะไรแทรกเหนือ hero) */
  disputeOpenedAtIso?: string | null
  children?: ReactNode
}

export default function NextActionShell({ emphasis, title, icon, iconColor, pill, disputeOpenedAtIso, children }: Props) {
  const hero = emphasis === 'hero'

  return (
    <Card sx={hero ? { boxShadow: 'var(--mui-customShadows-md)' } : undefined}>
      <Box sx={cardBodySx}>
        {hero ? (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, minWidth: 0 }}>
              {icon && (
                <Icon
                  icon={icon}
                  fontSize={26}
                  aria-hidden
                  style={{ flexShrink: 0, marginTop: 4, color: iconColor ?? VERIFY_BADGE_PALETTE.gold.fg }}
                />
              )}
              <Typography
                component='h2'
                variant='h4'
                // h4 (1.5rem) ของ ramp + 700 · balance กันยอดเงินยาวตกบรรทัดเดียวโดด · 1.4 กันสระ/วรรณยุกต์ไทยโดนตัด
                sx={{ m: 0, fontWeight: 700, lineHeight: 1.4, textWrap: 'balance' }}
              >
                {title}
              </Typography>
            </Box>
            {pill && (
              <Box sx={{ flexShrink: 0, mt: 0.5 }}>
                <TrustPill tone='tier' tierColor='secondary' label={pill} />
              </Box>
            )}
          </Box>
        ) : (
          <SectionTitle icon={icon}>{title}</SectionTitle>
        )}

        {children}

        {hero && disputeOpenedAtIso && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              mt: 2,
              px: 2,
              py: 1.5,
              borderRadius: 2,
              bgcolor: VERIFY_BADGE_PALETTE.gold.bg,
              color: VERIFY_BADGE_PALETTE.gold.fg,
            }}
          >
            <Icon icon='tabler-flag-3' fontSize={18} aria-hidden style={{ flexShrink: 0 }} />
            <Typography variant='body2' sx={{ fontWeight: 500, color: 'inherit' }}>
              แจ้งปัญหาแล้ว เมื่อ {formatDateTimeTH(disputeOpenedAtIso)}
            </Typography>
          </Box>
        )}
      </Box>
    </Card>
  )
}
