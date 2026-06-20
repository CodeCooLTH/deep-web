// Base: theme/vuexy/typescript-version/full-version/src/views/front-pages/help-center/Questions.tsx
// Adapted: ตัด Grid 2-column (sidebar, search, article list) ออก → single-column อ่านง่าย mobile-first
// Stripped deps: Breadcrumbs, Link (Vuexy), DirectionalIcon, CustomTextField, InputAdornment, Grid
// ทำไม RSC-safe nav: ข้อ 5 ใช้ NextLink ห่อ Typography แทน component={Link} (Hard Rule 2)

import type { Metadata } from 'next'

// Next Imports
import NextLink from 'next/link'

// MUI Imports
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'

// Third-party Imports
import classnames from 'classnames'

// Component Imports
import FrontLayout from '@components/layout/front-pages'

// Styles Imports
import frontCommonStyles from '@views/front-pages/styles.module.css'

// ทำไม: static metadata — หน้านี้ไม่มี dynamic segment
// ห้าม noindex (S-3/FR-L4) — ปล่อย default robots
export const metadata: Metadata = {
  title: 'นโยบายความเป็นส่วนตัว — Deep',
  description:
    'Deep (deepthailand.app) อธิบายว่าเราเก็บ ใช้ และคุ้มครองข้อมูลส่วนบุคคลของคุณอย่างไรเมื่อใช้งานแพลตฟอร์ม',
}

// ทำไม: Server Component — ไม่มี auth gate ไม่มี data fetch เหมาะกับ static page
const PrivacyPage = () => {
  return (
    <FrontLayout>
      {/* section shell มาจาก Questions.tsx — คง bg-backgroundPaper + spacing pattern */}
      <section className='flex flex-col justify-center items-center gap-4 md:plb-[100px] plb-[50px] pbs-[70px] -mbs-[70px] bg-backgroundPaper'>
        <div className={classnames('pbs-10 md:pbs-16', frontCommonStyles.layoutSpacing)}>
          {/* single-column — ตัด Grid 2-col ออก เพราะ legal text ไม่ต้องการ sidebar */}
          <div className='flex flex-col gap-2'>
            <Typography variant='h4'>นโยบายความเป็นส่วนตัว (Privacy Policy)</Typography>
            {/* วันที่ hardcode ตาม spec — ใช้ caption ตามลำดับ Typography hierarchy */}
            <Typography variant='caption' className='text-textSecondary'>
              อัปเดตล่าสุด 17 มิถุนายน 2569
            </Typography>
          </div>

          <Divider className='mlb-6' />

          <div className='flex flex-col gap-6'>
            {/* คำนำ */}
            <Typography variant='body1'>
              Deep (&quot;เรา&quot;) ให้ความสำคัญกับความเป็นส่วนตัวของผู้ใช้ นโยบายนี้อธิบายว่าเราเก็บ ใช้
              และคุ้มครองข้อมูลของคุณอย่างไรเมื่อใช้งานแพลตฟอร์ม Deep (deepthailand.app)
            </Typography>

            {/* หัวข้อ 1 */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                1. ข้อมูลที่เราเก็บ
              </Typography>
              <ul className='list-disc pli-6 flex flex-col gap-1'>
                <li>
                  <Typography variant='body2'>
                    ข้อมูลบัญชีและโปรไฟล์: ชื่อที่แสดง, ชื่อผู้ใช้, รูปโปรไฟล์, เบอร์โทรศัพท์, อีเมล
                  </Typography>
                </li>
                <li>
                  <Typography variant='body2'>
                    ข้อมูลจาก Facebook Login: เมื่อคุณเข้าสู่ระบบด้วย Facebook เรารับชื่อ รูปโปรไฟล์
                    และอีเมล (หากคุณอนุญาต) จาก Facebook เพื่อสร้าง/เชื่อมบัญชี
                  </Typography>
                </li>
                <li>
                  <Typography variant='body2'>
                    ข้อมูลร้านค้า (ถ้าเปิดร้าน): ชื่อร้าน, คำอธิบาย, โลโก้, หมวดหมู่, ที่อยู่
                  </Typography>
                </li>
                <li>
                  <Typography variant='body2'>
                    ข้อมูลการยืนยันตัวตน: เอกสารที่คุณอัปโหลดเพื่อยืนยันระดับความน่าเชื่อถือ
                  </Typography>
                </li>
                <li>
                  <Typography variant='body2'>
                    ข้อมูลธุรกรรม: คำสั่งซื้อ ข้อมูลผู้ซื้อ ที่อยู่จัดส่ง รีวิว
                    และคะแนนความน่าเชื่อถือ (Trust Score)
                  </Typography>
                </li>
              </ul>
            </div>

            {/* หัวข้อ 2 */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                2. วัตถุประสงค์ในการใช้ข้อมูล
              </Typography>
              <ul className='list-disc pli-6 flex flex-col gap-1'>
                <li>
                  <Typography variant='body2'>
                    สร้างและจัดการบัญชี, ยืนยันตัวตน, คำนวณ Trust Score และ Badge
                  </Typography>
                </li>
                <li>
                  <Typography variant='body2'>
                    ดำเนินการคำสั่งซื้อและการสื่อสารระหว่างผู้ซื้อ-ผู้ขาย
                  </Typography>
                </li>
                <li>
                  <Typography variant='body2'>
                    ป้องกันการฉ้อโกงและสร้างความน่าเชื่อถือในการซื้อขาย
                  </Typography>
                </li>
              </ul>
            </div>

            {/* หัวข้อ 3 */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                3. การเปิดเผย/แชร์ข้อมูล
              </Typography>
              <ul className='list-disc pli-6 flex flex-col gap-1'>
                <li>
                  <Typography variant='body2'>
                    โปรไฟล์สาธารณะ (ชื่อร้าน, รูป, Trust Score, รีวิว, สินค้า) แสดงต่อสาธารณะที่หน้า{' '}
                    <code>/u/{'{username}'}</code>
                  </Typography>
                </li>
                <li>
                  <Typography variant='body2'>
                    เราไม่ขายข้อมูลส่วนบุคคลของคุณ
                    และเปิดเผยต่อบุคคลที่สามเฉพาะเท่าที่จำเป็นต่อบริการ (เช่น ผู้ให้บริการ SMS)
                    หรือเมื่อกฎหมายกำหนด
                  </Typography>
                </li>
              </ul>
            </div>

            {/* หัวข้อ 4 */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                4. การเก็บรักษาและความปลอดภัย
              </Typography>
              <ul className='list-disc pli-6 flex flex-col gap-1'>
                <li>
                  <Typography variant='body2'>
                    เก็บข้อมูลตราบเท่าที่บัญชียังใช้งาน
                  </Typography>
                </li>
                <li>
                  <Typography variant='body2'>
                    รหัสผ่านเก็บแบบเข้ารหัส (hashed) โทเค็นและรหัสยืนยันเก็บแบบเข้ารหัส
                  </Typography>
                </li>
              </ul>
            </div>

            {/* หัวข้อ 5 */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                5. สิทธิ์ของผู้ใช้
              </Typography>
              <Typography variant='body2'>
                คุณมีสิทธิ์เข้าถึง แก้ไข และขอลบข้อมูลของคุณ — ดูวิธีที่หน้า{' '}
                {/* ทำไม RSC-safe: NextLink ห่อ Typography แทน component={Link} (Hard Rule 2) */}
                <NextLink href='/data-deletion' className='text-primary'>
                  การลบข้อมูลผู้ใช้
                </NextLink>
              </Typography>
            </div>

            {/* หัวข้อ 6 */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                6. การติดต่อ
              </Typography>
              <Typography variant='body2'>
                หากมีคำถามเกี่ยวกับนโยบายนี้ ติดต่อ:{' '}
                <a href='mailto:shinobu22@outlook.com' className='text-primary'>
                  shinobu22@outlook.com
                </a>
              </Typography>
            </div>
          </div>
        </div>
      </section>
    </FrontLayout>
  )
}

export default PrivacyPage
