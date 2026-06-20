// Next Imports
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

// Component Imports
import FrontLayout from '@components/layout/front-pages'
import ReportForm from '@views/front-pages/scam-check/ReportForm'

// Auth
import { authOptions } from '@/lib/auth'

export const metadata = {
  title: 'แจ้งรายงานมิจฉาชีพ | Deep'
}

const ReportPage = async () => {
  // ต้อง login ก่อนรายงาน — ไม่ login เด้งไป sign-in พร้อม callback กลับมา
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    redirect('/auth/sign-in?callbackUrl=/report')
  }

  return (
    <FrontLayout>
      <ReportForm />
    </FrontLayout>
  )
}

export default ReportPage
