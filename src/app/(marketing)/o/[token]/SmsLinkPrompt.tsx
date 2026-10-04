/**
 * SmsLinkPrompt — จอสั้นสำหรับเปิดจากลิงก์ SMS ในเคสที่ไม่มีจอ guest ให้ใช้ (ใบจอง BOOKING)
 *
 * เดิมใบจองที่เปิดแบบยังไม่ล็อกอินถูก redirect ไปหน้าเข้าสู่ระบบเสมอ (ต้องกรอกเบอร์) — ลิงก์ SMS
 * ส่งเข้าเบอร์นั้นแล้ว จึงให้กดปุ่มเดียวเข้าสู่ระบบด้วยลิงก์แทน (provider `sms-link`)
 * 🛑 ไม่แสดงรายละเอียดการจองก่อนกด — แสดงแค่ชื่อร้าน (ชุดเดียวกับที่หน้าเข้าสู่ระบบโชว์อยู่แล้ว)
 *
 * Base: src/app/(marketing)/o/[token]/ClaimOtpPrompt.tsx (shell: AuthIllustrationWrapper + Card + Logo ลิงก์กลับหน้าแรก)
 */
import Link from 'next/link'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'

import Logo from '@components/layout/shared/Logo'

import AuthIllustrationWrapper from '@/views/pages/auth/AuthIllustrationWrapper'
import SmsSignInButton from './SmsSignInButton'

type Props = { code: string; publicToken: string; shopName: string; label: string }

export default function SmsLinkPrompt({ code, publicToken, shopName, label }: Props) {
  return (
    <div className='flex min-bs-[100dvh] justify-center items-center p-6'>
      <AuthIllustrationWrapper>
        <Card className='flex flex-col sm:is-[450px]'>
          <CardContent className='sm:!p-12'>
            <div className='flex justify-center mbe-6'>
              <Link href='/' aria-label='กลับหน้าแรก' className='inline-flex'>
                <Logo />
              </Link>
            </div>
            <div className='flex flex-col gap-1 mbe-6 text-center'>
              <Typography variant='h4'>{shopName}</Typography>
              <Typography>ลิงก์นี้ส่งเข้าเบอร์ของคุณ จึงเปิดดูได้เลยโดยไม่ต้องกรอกเบอร์หรือ OTP</Typography>
            </div>
            <SmsSignInButton code={code} publicToken={publicToken} height={48}>
              {label}
            </SmsSignInButton>
          </CardContent>
        </Card>
      </AuthIllustrationWrapper>
    </div>
  )
}
