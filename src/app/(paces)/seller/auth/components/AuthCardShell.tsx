/**
 * AuthCardShell — wrapper ร่วมของ 5 หน้า seller auth
 *   (sign-in / sign-up / verify-otp / reset-pass / new-pass)
 *
 * Base: theme/paces/Admin/TS/src/app/auth/card/sign-in/page.tsx
 *   flex min-h-screen items-center p-12.5 > container > flex justify-center > xl:w-5/6
 *   > มุมตกแต่ง (absolute) + card rounded-2xl > grid lg:grid-cols-2
 *   [card-body p-12.5 (form) | image rounded-e-2xl + gradient]
 *
 * Responsive (จุดสลับ = 1024px ตามที่ user กำหนด):
 *   - ≤1024px (mobile + tablet) = เต็มจอ rounded-none, ไม่มีรูป/ไม่มี blob,
 *     form อยู่กลางแนวตั้ง (justify-center) + จำกัดความกว้าง centered (max-w-md)
 *   - >1024px (desktop)         = boxed card (theme look): container × w-5/6 +
 *     2 คอลัมน์ (form | image) + blob ตกแต่งมุมจอ
 *
 * ใช้ breakpoint `min-[1025px]:` (ไม่ใช่ lg=1024) เพราะ user ต้องการให้ 1024 = เต็มจอ
 *   (lg trigger ที่ ≥1024 จะทำให้ 1024 กลายเป็น boxed).
 *
 * children = เนื้อ form panel (logo block / content block / copyright) ของแต่ละหน้า
 */
import authCard from '@/assets/images/auth-card-bg.svg'
import authImg from '@/assets/images/auth.jpg'
import Image from 'next/image'
import type { ReactNode } from 'react'

export default function AuthCardShell({ children }: { children: ReactNode }) {
  return (
    // outer = positioning context ของ blob + จัดกึ่งกลางการ์ดบน desktop
    <div className="relative flex min-h-screen items-center justify-center min-[1025px]:p-12.5">
      {/* blob ตกแต่งมุมจอ — เฉพาะ desktop (boxed) ขนาดธรรมชาติเหมือน theme */}
      <div className="absolute end-0 top-0 hidden min-[1025px]:block">
        <Image src={authCard} alt="" aria-hidden />
      </div>
      <div className="absolute start-0 bottom-0 hidden rotate-180 min-[1025px]:block">
        <Image src={authCard} alt="" aria-hidden />
      </div>

      {/* container + centering — เฉพาะ >1024 (≤1024 = w-full เต็มจอ) */}
      <div className="w-full min-[1025px]:container">
        <div className="min-[1025px]:flex min-[1025px]:justify-center">
          <div className="min-[1025px]:w-5/6">
            {/* card — ≤1024 เต็มจอ rounded-none / >1024 boxed rounded-2xl */}
            <div className="card relative rounded-none min-[1025px]:rounded-2xl">
              {/* ≤1024 = min-h-screen เต็มจอ 1 คอลัมน์ / >1024 = สูงตามเนื้อหา + 2 คอลัมน์มีรูป */}
              <div className="grid min-h-screen grid-cols-1 min-[1025px]:min-h-0 min-[1025px]:grid-cols-2">
                {/* form panel — ≤1024 form อยู่กลางแนวตั้ง (justify-center) + จำกัดความกว้าง centered;
                    >1024 ปล่อยเต็ม panel (max-w-none) */}
                <div className="card-body relative flex flex-col justify-center p-6 sm:p-10 min-[1025px]:p-12.5">
                  <div className="mx-auto w-full max-w-md min-[1025px]:max-w-none">
                    {children}
                  </div>
                </div>

                {/* image panel — เฉพาะ >1024 */}
                <div
                  className="relative hidden h-full overflow-hidden rounded-e-2xl bg-cover bg-center min-[1025px]:block"
                  style={{ backgroundImage: `url("${authImg.src}")` }}
                >
                  {/* gradient overlay — bg-linear-to-t เป็น Tailwind utility ของ theme */}
                  <div className="absolute inset-0 bg-linear-to-t from-zinc-800 via-zinc-800/80 to-zinc-800/50" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
