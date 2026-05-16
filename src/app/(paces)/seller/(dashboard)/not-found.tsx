import authCard from '@/assets/images/auth-card-bg.svg'
import AuthLogo from '@/components/AuthLogo'
import { currentYear, META_DATA } from '@/config/constants'
import Image from 'next/image'
import Link from 'next/link'

// ไม่ระบุว่าเกิดจากอะไร (ย้าย / ลบ / ไม่มีสิทธิ์) เพื่อป้องกัน information disclosure
const NotFound = () => {
  return (
    <>
      <div className="flex min-h-screen items-center">
        <div className="container">
          <div className="flex justify-center lg:p-0 p-12.5">
            <div className="2xl:w-4/10 md:w-1/2 sm:w-2/3 w-full">
              <div className="absolute end-0 top-0">
                <Image src={authCard} alt="auth-card-bg" />
              </div>

              <div className="absolute start-0 bottom-0 rotate-180">
                <Image src={authCard} alt="auth-card-bg" />
              </div>
              <div className="card rounded-2xl">
                <div className="card-body p-7.5">
                  <div className="mb-base flex flex-col items-center justify-center text-center">
                    <AuthLogo />
                  </div>
                  <div className="p-6 text-center">
                    <div className="from-primary my-4 bg-linear-to-r to-danger bg-clip-text text-7xl font-bold text-transparent">404</div>
                    <h3 className="mb-2 text-xl font-bold uppercase">ไม่พบหน้าที่คุณค้นหา</h3>
                    <p className="text-default-400 mx-auto">หน้านี้อาจถูกย้าย ลบ หรือคุณไม่มีสิทธิ์เข้าถึง</p>
                    <div className="mt-8 flex items-center justify-center gap-1.5">
                      <Link href="/seller/dashboard" className="btn bg-primary text-white hover:bg-primary-hover">
                        กลับหน้าร้านค้า
                      </Link>
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-default-400 mt-7.5 text-center">
                &copy; {currentYear} {META_DATA.name} - by <span>{META_DATA.author}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default NotFound
