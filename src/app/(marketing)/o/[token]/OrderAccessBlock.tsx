'use client'

/**
 * OrderAccessBlock — Screen 3 (UX-Design-Spec §Screen 3), 3 reason variants
 *
 * ทำไม (security must-fix เดิม + feature 00015): page.tsx ต้อง early-return component นี้
 * **ก่อน** สร้าง PublicOrderData → ไม่ส่ง order detail ใด ๆ ลง RSC flight (กัน PII leak ไปยัง
 * user ผิดคน). Component รับแค่ `reason` — ไม่มี order data prop ใด ๆ (Q2: legacy ไม่มี shop
 * deep-link ด้วยเหตุผลเดียวกัน)
 *
 * reason:
 *   - owner-mismatch: order.buyerUserId ตั้งเป็นบัญชีอื่นแล้ว (OWNER_MISMATCH)
 *   - legacy: order เก่าไม่มีเบอร์ผูก claim ไม่ได้ (LEGACY_NO_CLAIM)
 *
 * เดิมมี variant 'phone-mismatch' สำหรับ decision OTP_CLAIM_BLOCKED ด้วย — ถูกถอดออกใน S-2
 * เพราะเคสนั้นไม่ใช่ทางตันอีกแล้ว ผู้ใช้ไปต่อได้ที่ PhoneVerifyPrompt (ยืนยันเบอร์ด้วย OTP)
 *
 * Base: theme/vuexy/typescript-version/full-version/src/@core/components/mui/Avatar.tsx
 *   (CustomAvatar skin='light' variant='rounded' — icon avatar)
 *   + sign-in flex-center shell pattern (ไม่ใช้ AuthIllustrationWrapper — error state ไม่ใช่ branding moment)
 *   + theme/vuexy/typescript-version/full-version/src/components/dialogs/two-factor-auth/index.tsx (Button pattern)
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'
import { signOut } from 'next-auth/react'

import CustomAvatar from '@core/components/mui/Avatar'
import Logo from '@components/layout/shared/Logo'

export type OrderAccessBlockReason = 'owner-mismatch' | 'legacy'

const CONTENT: Record<
  OrderAccessBlockReason,
  {
    icon: string
    color: 'error' | 'warning' | 'secondary'
    headline: string
    body: string
    action: boolean
  }
> = {
  'owner-mismatch': {
    icon: 'tabler-user-x',
    color: 'error',
    headline: 'ออเดอร์นี้เป็นของบัญชีอื่น',
    body: 'บัญชีที่คุณเข้าสู่ระบบอยู่ไม่ใช่เจ้าของออเดอร์นี้',
    action: true,
  },
  legacy: {
    icon: 'tabler-mail-off',
    color: 'secondary',
    headline: 'ออเดอร์นี้ไม่มีเบอร์โทรผูกไว้',
    body: 'เป็นออเดอร์เก่าที่ไม่มีข้อมูลเบอร์ยืนยัน — กรุณาติดต่อร้านค้าโดยตรง',
    action: false,
  },
}

export default function OrderAccessBlock({ reason }: { reason: OrderAccessBlockReason }) {
  const pathname = usePathname()
  const content = CONTENT[reason]

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        px: 6,
        gap: 3.5,
        bgcolor: 'background.default',
      }}
    >
      {/**
       * ตราแบรนด์ — 🛑 จอพี่น้องอีกสองจอ (`ClaimOtpPrompt` · `PhoneVerifyPrompt`) เพิ่มตรงนี้
       * ไว้แล้วพร้อมเหตุผลเต็ม ๆ ว่า **จอกลุ่มนี้ไม่มีทางออกไปหน้าอื่นเลย** และ header ของ
       * `FrontLayout` ที่เคยเป็นทางออกถูกถอดออกไปแล้ว (FR-019) — จอนี้ตกหล่นจากรอบนั้น
       *
       * ที่นี่มีลิงก์ "กลับหน้าหลัก" อยู่ท้ายจอก็จริง แต่มันเป็นข้อความสีจางใต้ปุ่ม ไม่ใช่
       * จุดยึดสายตา · ผู้ซื้อที่มาถึงจอนี้กำลังงงว่าตัวเองอยู่ที่ไหน — ตราแบรนด์ตอบคำถามนั้น
       * ก่อนที่เขาจะอ่านอะไรเลย และเป็นสิ่งเดียวกับที่อีกสองจอตอบให้แล้ว
       * (`sibling-surface-parity.md`: จอพี่น้องบอกว่าหน้านี้ควรมีอะไร)
       */}
      <Link href='/' aria-label='กลับหน้าแรก' className='inline-flex'>
        <Logo />
      </Link>

      <CustomAvatar skin='light' variant='rounded' color={content.color} size={64}>
        <Icon icon={content.icon} fontSize={30} />
      </CustomAvatar>

      <Box sx={{ maxWidth: 340 }}>
        <Typography variant='h5' sx={{ mb: 1 }}>
          {content.headline}
        </Typography>
        <Typography color='text.secondary'>{content.body}</Typography>
      </Box>

      {content.action && (
        <Button
          fullWidth
          variant='contained'
          color='error'
          sx={{ maxWidth: 340 }}
          onClick={() => signOut({ callbackUrl: pathname ?? '/' })}
        >
          ออกจากระบบ แล้วใช้เบอร์อื่น
        </Button>
      )}

      <Typography component={Link} href='/' color='text.secondary' sx={{ fontWeight: 500, textDecoration: 'none' }}>
        กลับหน้าหลัก
      </Typography>
    </Box>
  )
}
