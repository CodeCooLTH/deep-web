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
 *   - desktop (lg+) = การ์ด landscape กว้างเหมือน theme — replicate กลไก theme เป๊ะ:
 *     container > flex justify-center > xl:w-5/6 (ขยายตามจอ, ที่ xl ≈ 1067px)
 *   - mobile (<lg)  = ฟอร์มเต็มจอ rounded-none (grid min-h-screen, image panel ซ่อน)
 *
 * ทำไมรวมเป็น shell: เดิม 5 หน้า duplicate wrapper เดียวกัน.
 * บทเรียน: เคย cap ด้วย `max-w-4xl` (896px คงที่) โดยเข้าใจผิดว่า = ขนาด theme card
 *   → จริง ๆ theme ใช้ container × xl:w-5/6 (กว้างกว่า ~170px + ขยายตามจอ) → การ์ดเราแคบกว่า
 *   ("ห่างกันเกินไป"). แก้ด้วยการ replicate 3-layer ของ theme ตรง ๆ + blob ผูกกับ
 *   card region (xl:w-5/6) ไม่ใช่ viewport.
 *
 * children = เนื้อ form panel (logo block / content block / copyright) ของแต่ละหน้า
 */
import authCard from '@/assets/images/auth-card-bg.svg'
import authImg from '@/assets/images/auth.jpg'
import Image from 'next/image'
import type { ReactNode } from 'react'

export default function AuthCardShell({ children }: { children: ReactNode }) {
  return (
    // outer wrapper เป็น positioning context ของ blob (relative) ครอบเต็มจอ
    //   phone (<md)  = block เต็มจอ ไม่มีกรอบ/ไม่มี blob
    //   tablet+ (md) = flex center + p-12.5 + การ์ด boxed + blob ตกแต่งมุมจอ (เหมือน theme #5)
    <div className="relative min-h-screen md:flex md:items-center md:p-12.5">
      {/* มุมตกแต่งพื้นหลัง — anchor ที่ outer (เต็มจอ) ขนาดธรรมชาติเหมือน theme (ไม่ใส่ w-* / ไม่ครอบใน card)
          theme: blob ขวาบน + ซ้ายล่าง (rotate-180); แสดงเฉพาะตอนการ์ด boxed (md+) */}
      <div className="absolute end-0 top-0 hidden md:block">
        <Image src={authCard} alt="" aria-hidden />
      </div>
      <div className="absolute start-0 bottom-0 hidden rotate-180 md:block">
        <Image src={authCard} alt="" aria-hidden />
      </div>

      {/* container + centering layer — เฉพาะ md+ (theme: container > flex justify-center) */}
      <div className="md:container">
        <div className="md:flex md:justify-center">
          {/* width node = xl:w-5/6 (theme) */}
          <div className="xl:w-5/6">
            {/* card — phone เต็มจอ rounded-none / tablet+ boxed rounded-2xl */}
            <div className="card relative rounded-none md:rounded-2xl">
              {/* grid: phone ถือ min-h-screen (form ยืดเต็มจอ) / md+ สูงตามเนื้อหา / 2-col + รูปที่ lg+ (เหมือน theme) */}
              <div className="grid min-h-screen grid-cols-1 md:min-h-0 lg:grid-cols-2">
                {/* form panel — card-body (theme) + responsive padding */}
                <div className="card-body relative flex flex-col justify-between p-6 sm:p-10 lg:p-12.5">
                  {children}
                </div>

                {/* image panel — lg+ เท่านั้น (ตรง theme: image hidden จนถึง lg) */}
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
      </div>
    </div>
  )
}
