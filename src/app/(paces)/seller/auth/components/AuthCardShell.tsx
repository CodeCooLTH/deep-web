/**
 * AuthCardShell — wrapper ร่วมของ 5 หน้า seller auth
 *   (sign-in / sign-up / verify-otp / reset-pass / new-pass)
 *
 * Base: theme/paces/Admin/TS/src/app/auth/card/sign-in/page.tsx
 *   flex min-h-screen items-center p-12.5 > container > flex justify-center > xl:w-5/6
 *   > มุมตกแต่ง (absolute) + card rounded-2xl > grid lg:grid-cols-2
 *   [card-body p-12.5 (form) | image rounded-e-2xl + gradient]
 *
 * Responsive adapt:
 *   - desktop (lg+) = การ์ด landscape กว้างเหมือน theme (container × xl:w-5/6)
 *   - mobile (<lg)  = ฟอร์มเต็มจอ rounded-none (grid min-h-screen, image panel ซ่อน)
 *
 * ทำไมรวมเป็น shell: เดิม 5 หน้า duplicate wrapper เดียวกัน + ใช้ md:max-w-4xl (896px)
 *   → การ์ดแคบ ฟอร์ม+รูปอัดกัน ("แคปๆ" ไม่เหมือน theme). รวมที่เดียว + width xl:w-5/6
 *   → ตรง proportion theme + กัน 5 หน้า diverge.
 *
 * children = เนื้อ form panel (logo block / content block / copyright) ของแต่ละหน้า
 */
import authCard from '@/assets/images/auth-card-bg.svg'
import authImg from '@/assets/images/auth.jpg'
import Image from 'next/image'
import type { ReactNode } from 'react'

export default function AuthCardShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen lg:flex lg:items-center lg:justify-center lg:bg-default-100 lg:p-12.5">
      {/* มุมตกแต่งพื้นหลัง — มุมจอ (เหมือน theme: blob ขวาบน + ซ้ายล่าง), desktop เท่านั้น */}
      <div className="absolute end-0 top-0 hidden lg:block">
        <Image src={authCard} alt="" aria-hidden className="w-45" />
      </div>
      <div className="absolute start-0 bottom-0 hidden rotate-180 lg:block">
        <Image src={authCard} alt="" aria-hidden className="w-45" />
      </div>

      {/* card region — cap ที่ max-w-4xl (896px ≈ ขนาด theme card/sign-in) ไม่ให้พองตามจอ */}
      <div className="relative w-full lg:max-w-4xl">
        {/* card — mobile เต็มจอ rounded-none / desktop boxed rounded-2xl */}
        <div className="card relative rounded-none lg:rounded-2xl">
          {/* grid ถือ min-h-screen เพื่อให้ form panel ยืดเต็มจอ (justify-between ทำงาน) */}
          <div className="grid min-h-screen grid-cols-1 lg:min-h-0 lg:grid-cols-2">
            {/* form panel */}
            <div className="relative flex flex-col justify-between p-6 sm:p-10 lg:p-12.5">
              {children}
            </div>

            {/* image panel — desktop เท่านั้น */}
            <div
              className="relative hidden h-full overflow-hidden rounded-e-2xl bg-cover bg-center lg:block"
              style={{ backgroundImage: `url("${authImg.src}")` }}
            >
              {/* gradient overlay — bg-linear-to-t เป็น Tailwind utility ของ theme */}
              <div className="absolute inset-0 bg-linear-to-t from-zinc-800 via-zinc-800/80 to-zinc-800/50" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
