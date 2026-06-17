// Base: theme/vuexy/typescript-version/full-version/src/views/front-pages/help-center/Questions.tsx
// Adapted: single-column (ตัด Grid sidebar), content ภาษาไทย, เพิ่ม highlight callout email box
// Strip: Grid, Breadcrumbs, InputAdornment, CustomTextField, DirectionalIcon, classnames, Link from @components/Link
// ทำไม mailto ใช้ plain <a>: next/link ไว้ navigate internal route — mailto ไม่ใช่ route

// Next Imports
import type { Metadata } from 'next'

// MUI Imports
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'

// Component Imports
import FrontLayout from '@components/layout/front-pages'

// Styles Imports
import frontCommonStyles from '@views/front-pages/styles.module.css'

export const metadata: Metadata = {
  title: 'การลบข้อมูลผู้ใช้ — Deep',
  description:
    'คำแนะนำการขอลบข้อมูลส่วนบุคคลของคุณออกจากแพลตฟอร์ม Deep (deepthailand.app) รวมถึงข้อมูลที่เชื่อมจากการเข้าสู่ระบบด้วย Facebook',
  // ทำไม: FR-L4 ห้าม noindex — หน้านี้ต้องเปิดให้ Meta crawler เข้าถึงเพื่อยืนยัน Data Deletion URL
}

export default function DataDeletionPage() {
  return (
    <FrontLayout>
      <section className='flex flex-col justify-center items-center gap-4 md:plb-[100px] plb-[50px] pbs-[70px] -mbs-[70px] bg-backgroundPaper'>
        <div className={`pbs-10 md:pbs-16 ${frontCommonStyles.layoutSpacing}`}>
          {/* หัวเรื่อง + วันที่ */}
          <Typography variant='h4' className='mbe-2'>
            การลบข้อมูลผู้ใช้ (User Data Deletion)
          </Typography>
          <Typography variant='body2' color='text.secondary' className='mbe-2'>
            อัปเดตล่าสุด 17 มิถุนายน 2569
          </Typography>
          {/* คำนำ */}
          <Typography variant='body1' className='mbe-4'>
            หากคุณต้องการให้ Deep ลบข้อมูลส่วนบุคคลของคุณ (รวมถึงข้อมูลที่เชื่อมจากการเข้าสู่ระบบด้วย Facebook)
            สามารถดำเนินการตามขั้นตอนด้านล่าง
          </Typography>
          <Divider className='mlb-6' />

          {/* เนื้อหา 4 หัวข้อ */}
          <div className='flex flex-col gap-6'>

            {/* หัวข้อ 1: วิธีขอลบข้อมูล — highlight callout box */}
            <div>
              <Typography variant='h6' className='mbe-4'>
                1. วิธีขอลบข้อมูล
              </Typography>
              {/* ทำไม: FR-L2 "explicit instructions" กำหนดให้มี email ที่เด่นชัด (callout pattern จาก Questions.tsx บรรทัด ~83) */}
              <div className='pli-5 plb-5 mbe-4 bg-actionHover rounded'>
                <Typography variant='body2' className='mbe-2'>
                  ส่งอีเมลมาที่:
                </Typography>
                <a href='mailto:shinobu22@outlook.com'>
                  <Typography variant='h6' color='primary'>
                    shinobu22@outlook.com
                  </Typography>
                </a>
              </div>
              <Typography variant='body2' className='mbe-2'>
                โดยระบุหัวข้ออีเมล: <strong>"ขอลบข้อมูล (Data Deletion Request)"</strong>
              </Typography>
              <Typography variant='body2'>
                พร้อมแจ้งข้อมูลที่ใช้ระบุบัญชีของคุณ: ชื่อผู้ใช้ (username) และ/หรือ เบอร์โทร/อีเมลที่ใช้สมัคร
              </Typography>
            </div>

            <Divider />

            {/* หัวข้อ 2: ข้อมูลที่จะถูกลบ */}
            <div>
              <Typography variant='h6' className='mbe-4'>
                2. ข้อมูลที่จะถูกลบ
              </Typography>
              <ul className='list-disc pli-6 flex flex-col gap-1'>
                <li>
                  <Typography variant='body2'>ข้อมูลบัญชีและโปรไฟล์ (ชื่อ, รูป, เบอร์โทร, อีเมล)</Typography>
                </li>
                <li>
                  <Typography variant='body2'>การเชื่อมต่อ Facebook (โทเค็น OAuth)</Typography>
                </li>
                <li>
                  <Typography variant='body2'>ข้อมูลร้านค้า (ถ้าเปิดร้าน)</Typography>
                </li>
                <li>
                  <Typography variant='body2'>เอกสารยืนยันตัวตนที่คุณอัปโหลด</Typography>
                </li>
                <li>
                  <Typography variant='body2'>ข้อมูลที่เชื่อมโยงกับบัญชีทั้งหมด</Typography>
                </li>
              </ul>
              <Typography variant='body2' color='text.secondary' className='mbs-3'>
                หมายเหตุ: ข้อมูลธุรกรรมบางอย่างที่กฎหมายกำหนดให้เก็บ อาจถูกเก็บในรูปแบบไม่ระบุตัวตนตามที่กฎหมายอนุญาต
              </Typography>
            </div>

            <Divider />

            {/* หัวข้อ 3: กรอบเวลา */}
            <div>
              <Typography variant='h6' className='mbe-4'>
                3. กรอบเวลา
              </Typography>
              <Typography variant='body2'>
                เราจะดำเนินการตามคำขอภายใน 30 วันนับจากวันที่ได้รับคำขอที่ครบถ้วน และจะยืนยันกลับทางอีเมล
              </Typography>
            </div>

            <Divider />

            {/* หัวข้อ 4: การติดต่อ */}
            <div>
              <Typography variant='h6' className='mbe-4'>
                4. การติดต่อ
              </Typography>
              <Typography variant='body2'>
                หากมีคำถามเพิ่มเติม สามารถติดต่อเราได้ที่:{' '}
                <a href='mailto:shinobu22@outlook.com' className='text-primary hover:underline'>
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
