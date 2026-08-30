// Base: theme/vuexy/typescript-version/full-version/src/views/front-pages/help-center/Questions.tsx
// Adapted: ตัด Grid 2-column (sidebar, search, article list) ออก → single-column; เพิ่ม highlight callout email box
// Stripped deps: Breadcrumbs, Link (Vuexy), DirectionalIcon, CustomTextField, InputAdornment, Grid
// ทำไม mailto ใช้ plain <a>: next/link ไว้ navigate internal route — mailto ไม่ใช่ route

import type { Metadata } from 'next'

// MUI Imports
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'
// Button ใช้ href ตรง ๆ (render เป็น <a>) — ห้าม component={Link} ในหน้า server component
// ตาม docs/conventions/rsc-mui-navigation.md (Hard Rule 2)
import Button from '@mui/material/Button'

// Third-party Imports
import classnames from 'classnames'

// Component Imports
import FrontLayout from '@components/layout/front-pages'

// Styles Imports
import frontCommonStyles from '@views/front-pages/styles.module.css'

// ทำไม: static metadata — หน้านี้ไม่มี dynamic segment
// ห้าม noindex (S-3/FR-L4) — Meta crawler ต้องเข้าถึงเพื่อยืนยัน Data Deletion URL
export const metadata: Metadata = {
  title: 'การลบข้อมูลผู้ใช้ — Deep',
  description:
    'คำแนะนำการขอลบข้อมูลส่วนบุคคลของคุณออกจากแพลตฟอร์ม Deep (deepthailand.app) รวมถึงข้อมูลที่เชื่อมจากการเข้าสู่ระบบด้วย Facebook',
}

// ทำไม: Server Component — ไม่มี auth gate ไม่มี data fetch เหมาะกับ static page
const DataDeletionPage = () => {
  return (
    <FrontLayout>
      {/* section shell มาจาก Questions.tsx — คง bg-backgroundPaper + spacing pattern */}
      <section className='flex flex-col justify-center items-center gap-4 md:plb-[100px] plb-[50px] pbs-[70px] -mbs-[70px] bg-backgroundPaper'>
        <div className={classnames('pbs-10 md:pbs-16', frontCommonStyles.layoutSpacing)}>
          {/* title block — pattern เดียวกับ Questions.tsx: flex-col gap-2 → Divider */}
          <div className='flex flex-col gap-2'>
            <Typography variant='h4'>การลบข้อมูลผู้ใช้ (User Data Deletion)</Typography>
            <Typography variant='caption' className='text-textSecondary'>
              อัปเดตล่าสุด 4 สิงหาคม 2569
            </Typography>
          </div>

          <Divider className='mlb-6' />

          <div className='flex flex-col gap-6'>
            {/* คำนำ */}
            <Typography variant='body1'>
              หากคุณต้องการให้ Deep ลบข้อมูลส่วนบุคคลของคุณ (รวมถึงข้อมูลที่เชื่อมจากการเข้าสู่ระบบด้วย Facebook)
              สามารถดำเนินการตามขั้นตอนด้านล่าง
            </Typography>

            {/* หัวข้อ 1: วิธีขอลบข้อมูล — highlight callout box
                🛑 ทางหลักต้องเป็น "ปุ่มในแอป" เสมอ ห้ามสลับกลับไปให้อีเมลนำ:
                App Store Guideline 5.1.1(v) ระบุว่าแอปที่สมัครบัญชีได้ ต้องให้ผู้ใช้เริ่มลบบัญชี
                ได้ด้วยตัวเองจากในแอป — หน้าที่บอกว่า "ส่งอีเมลมาขอ" อย่างเดียวคือเหตุผลที่แอปถูก
                ตีกลับ (อีเมลคงไว้เป็นทางสำรองสำหรับคนที่ล็อกอินไม่ได้แล้วเท่านั้น) */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                1. ลบบัญชีด้วยตัวเอง (แนะนำ)
              </Typography>
              {/* callout pattern จาก Questions.tsx บรรทัด 83 (bg-actionHover rounded), ขยาย plb เพื่อเน้น */}
              <div className='bg-actionHover rounded-2xl p-5'>
                <Typography variant='body2' className='mbe-3'>
                  เข้าสู่ระบบแล้วกดลบได้ทันที ข้อมูลส่วนตัวจะถูกล้างออกจากระบบภายใน 30 วัน
                </Typography>
                <ul className='list-disc pli-6 flex flex-col gap-1 mbe-3'>
                  <li>
                    <Typography variant='body2'>
                      <strong>ผู้ซื้อ</strong> — ตั้งค่าบัญชี → เลื่อนลงล่างสุด → &quot;ลบบัญชี&quot;
                    </Typography>
                  </li>
                  <li>
                    <Typography variant='body2'>
                      <strong>ผู้ขาย</strong> — เมนู &quot;ร้านค้า&quot; → เลื่อนลงล่างสุด → &quot;ลบบัญชี&quot;
                    </Typography>
                  </li>
                </ul>
                <Button
                  variant='contained'
                  color='error'
                  href='/settings/profile'
                  startIcon={<i className='tabler-trash' />}
                >
                  ไปที่ตั้งค่าบัญชี
                </Button>
                <Typography variant='body2' className='mbs-3 text-textSecondary'>
                  หากมีคำสั่งซื้อที่ยังไม่ปิด ระบบจะแจ้งให้จัดการให้เรียบร้อยก่อน
                  เพื่อไม่ให้คู่ค้าที่โอนเงินมาแล้วเสียหาย
                </Typography>
              </div>
            </div>

            {/* หัวข้อ 2: ทางสำรอง — สำหรับคนที่เข้าระบบไม่ได้แล้ว */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                2. เข้าสู่ระบบไม่ได้แล้ว?
              </Typography>
              <div className='bg-actionHover rounded-2xl p-5'>
                <Typography variant='body2' className='mbe-2'>
                  ส่งอีเมลมาที่:
                </Typography>
                <a href='mailto:shinobu22@outlook.com'>
                  <Typography variant='h6' color='primary'>
                    shinobu22@outlook.com
                  </Typography>
                </a>
                <Typography variant='body2' className='mbs-2 text-textSecondary'>
                  ระบุหัวข้ออีเมล &quot;ขอลบข้อมูล (Data Deletion Request)&quot; พร้อมแจ้งชื่อผู้ใช้ (username)
                  และ/หรือ เบอร์โทร/อีเมลที่ใช้สมัคร
                </Typography>
              </div>
            </div>

            {/* หัวข้อ 3: ข้อมูลที่จะถูกลบ */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                3. ข้อมูลที่จะถูกลบ
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
                <li>
                  <Typography variant='body2'>
                    หากคุณเป็นร้านค้าที่เชื่อมเพจ Facebook หรือบัญชี Instagram ไว้:
                    โทเค็นการเข้าถึงเพจ, บทสนทนากับลูกค้าที่ดึงเข้ามาแสดงในระบบ, ไฟล์แนบที่สำเนามาเก็บ
                    และข้อมูลผู้ติดต่อจากช่องทางเหล่านั้น
                  </Typography>
                </li>
              </ul>
              <Typography variant='body2' className='mbs-3 text-textSecondary'>
                หมายเหตุ: ข้อมูลธุรกรรมบางอย่างที่กฎหมายกำหนดให้เก็บ อาจถูกเก็บในรูปแบบไม่ระบุตัวตนตามที่กฎหมายอนุญาต
              </Typography>
            </div>

            {/* หัวข้อ 4 — เพิ่ม 2569-07-27 สำหรับ Meta App Review (feature 00018)
                คนที่ทักเข้าเพจร้านไม่ได้เป็นผู้ใช้ Deep จึงไม่มี username ให้อ้างอิงตามขั้นตอนข้อ 1
                Meta บังคับว่าต้องมีช่องทางให้คนกลุ่มนี้ขอลบข้อมูลได้ด้วย ไม่ใช่เฉพาะผู้ถือบัญชี */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                4. หากคุณเป็นลูกค้าที่ทักเข้าเพจของร้าน
              </Typography>
              <Typography variant='body2' className='mbe-3'>
                หากคุณส่งข้อความหาเพจ Facebook หรือบัญชี Instagram ของร้านที่ใช้ Deep
                บทสนทนานั้นจะปรากฏในกล่องข้อความของร้าน คุณขอให้ลบข้อมูลของคุณได้แม้ไม่มีบัญชี Deep:
              </Typography>
              <ul className='list-disc pli-6 flex flex-col gap-1'>
                <li>
                  <Typography variant='body2'>
                    ส่งอีเมลมาที่ที่อยู่ในข้อ 1 พร้อมระบุชื่อเพจหรือบัญชี Instagram ของร้านที่คุณทักไป
                    และชื่อโปรไฟล์ที่คุณใช้ทัก เพื่อให้เราค้นหาบทสนทนาที่ถูกต้อง
                  </Typography>
                </li>
                <li>
                  <Typography variant='body2'>
                    เราจะลบบทสนทนา ไฟล์แนบ และข้อมูลผู้ติดต่อของคุณออกจากระบบของ Deep
                  </Typography>
                </li>
                <li>
                  <Typography variant='body2'>
                    ข้อความต้นฉบับที่ยังอยู่บน Facebook หรือ Instagram อยู่นอกการควบคุมของเรา
                    ต้องลบผ่านแอปของ Meta โดยตรง
                  </Typography>
                </li>
              </ul>
            </div>

            {/* หัวข้อ 5: กรอบเวลา */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                5. กรอบเวลา
              </Typography>
              <Typography variant='body2'>
                เราจะดำเนินการตามคำขอภายใน 30 วันนับจากวันที่ได้รับคำขอที่ครบถ้วน และจะยืนยันกลับทางอีเมล
              </Typography>
            </div>

            {/* หัวข้อ 6: การติดต่อ */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                6. การติดต่อ
              </Typography>
              {/* ผู้ควบคุมข้อมูล — ต้องตรงกับหน้า privacy/terms และกับ responsible-1 ใน Meta Data Handling */}
              <Typography variant='body2'>
                ผู้ควบคุมข้อมูลส่วนบุคคล: <strong>Sekson Oonnom</strong> (บุคคลธรรมดา) ประเทศไทย
              </Typography>
              <Typography variant='body2' className='mbs-2'>
                หากมีคำถามเพิ่มเติม สามารถติดต่อเราได้ที่:{' '}
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

export default DataDeletionPage
