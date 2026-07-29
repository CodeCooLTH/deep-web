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
    <FrontLayout hideChromeMobile>
      {/* section shell มาจาก Questions.tsx — คง bg-backgroundPaper + spacing pattern */}
      <section className='flex flex-col justify-center items-center gap-4 md:plb-[100px] plb-[50px] pbs-[70px] -mbs-[70px] bg-backgroundPaper'>
        <div className={classnames('pbs-10 md:pbs-16', frontCommonStyles.layoutSpacing)}>
          {/* single-column — ตัด Grid 2-col ออก เพราะ legal text ไม่ต้องการ sidebar */}
          <div className='flex flex-col gap-2'>
            <Typography variant='h4'>นโยบายความเป็นส่วนตัว (Privacy Policy)</Typography>
            {/* วันที่ hardcode ตาม spec — ใช้ caption ตามลำดับ Typography hierarchy */}
            <Typography variant='caption' className='text-textSecondary'>
              อัปเดตล่าสุด 27 กรกฎาคม 2569
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
                <li>
                  <Typography variant='body2'>
                    ข้อมูลจากการเชื่อมเพจ Facebook / บัญชี Instagram (เฉพาะร้านค้าที่เลือกเชื่อม):
                    ข้อความและไฟล์แนบในบทสนทนาระหว่างร้านกับลูกค้า, รหัสผู้ใช้เฉพาะเพจ (PSID/IGSID),
                    ชื่อและรูปโปรไฟล์ของผู้ที่ทักเข้ามา, และโทเค็นสำหรับเข้าถึงเพจ — ดูรายละเอียดที่ข้อ 5
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
                <li>
                  <Typography variant='body2'>
                    แสดงบทสนทนาจากเพจ Facebook / Instagram ที่ร้านเชื่อมไว้ในกล่องข้อความเดียวกับ
                    คำสั่งซื้อ เพื่อให้ร้านตอบลูกค้าและออกคำสั่งซื้อได้จากที่เดียว
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
                    และเปิดเผยต่อบุคคลที่สามเฉพาะเท่าที่จำเป็นต่อบริการ (เช่น ผู้ให้บริการ SMS,
                    ผู้ให้บริการขนส่ง, ผู้ให้บริการโครงสร้างพื้นฐานและฐานข้อมูล) หรือเมื่อกฎหมายกำหนด
                  </Typography>
                </li>
                <li>
                  <Typography variant='body2'>
                    ผู้ช่วย AI ร่างคำตอบ (ปิดอยู่โดยค่าเริ่มต้น ร้านเปิดใช้เองได้): เมื่อร้านกดขอให้ AI
                    ช่วยร่างคำตอบ เราส่งข้อความล่าสุดในบทสนทนานั้นไปประมวลผลที่ Google (Gemini)
                    เพื่อสร้างข้อความร่าง — AI ไม่ส่งข้อความหาลูกค้าเอง ร้านต้องกดส่งเสมอ
                    ดูรายละเอียดว่าส่งอะไรบ้างที่ข้อ 6
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

            {/* หัวข้อ 5 — เพิ่ม 2569-07-27 สำหรับ Meta App Review (feature 00018)
                ต้องอธิบายข้อมูลของ "ลูกค้าที่ทักเข้ามา" ให้ครบทุกชนิดที่ขอสิทธิ์ ไม่ใช่แค่ข้อมูลบัญชี
                ของผู้ใช้ Deep — ผู้ตรวจของ Meta เทียบข้อความในหน้านี้กับ permission ที่ยื่นทีละข้อ */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                5. การเชื่อมต่อเพจ Facebook และบัญชี Instagram (สำหรับร้านค้า)
              </Typography>
              <Typography variant='body2' className='mbe-3'>
                ร้านค้าเลือกเชื่อมเพจ Facebook หรือบัญชี Instagram ของตนเองเข้ากับ Deep ได้
                เพื่อให้ข้อความจากลูกค้ามาปรากฏในกล่องข้อความเดียวกับคำสั่งซื้อ การเชื่อมต่อนี้
                ไม่ใช่ข้อบังคับ และมีผลเฉพาะเพจที่ร้านเลือกเองเท่านั้น
              </Typography>
              <ul className='list-disc pli-6 flex flex-col gap-1'>
                <li>
                  <Typography variant='body2'>
                    ข้อมูลที่เราได้รับ: ข้อความที่ลูกค้าส่งถึงเพจและข้อความที่ร้านตอบกลับ (รวมข้อความ
                    ที่ร้านตอบจากแอป Messenger โดยตรง), ไฟล์แนบ (รูป เสียง วิดีโอ ไฟล์), สถานะการอ่าน,
                    รีแอ็กชัน, และโฆษณาหรือลิงก์ที่ลูกค้าคลิกก่อนเข้าแชท
                  </Typography>
                </li>
                <li>
                  <Typography variant='body2'>
                    ข้อมูลผู้ที่ทักเข้ามา: รหัสผู้ใช้ที่ Meta ออกให้เฉพาะเพจนั้น (PSID/IGSID)
                    พร้อมชื่อและรูปโปรไฟล์ เพื่อให้ร้านรู้ว่ากำลังคุยกับใคร — เราไม่สร้างบัญชีผู้ใช้ Deep
                    ให้บุคคลเหล่านี้โดยอัตโนมัติ
                  </Typography>
                </li>
                <li>
                  <Typography variant='body2'>
                    ไฟล์แนบจะถูกสำเนามาเก็บในระบบจัดเก็บไฟล์ของ Deep เพื่อให้ร้านเปิดดูย้อนหลังได้
                    หลังลิงก์ต้นทางของ Meta หมดอายุ
                  </Typography>
                </li>
                <li>
                  <Typography variant='body2'>
                    โทเค็นการเข้าถึงเพจถูกเก็บแบบเข้ารหัส (AES-256-GCM) ไม่ถูกส่งออกไปยังเบราว์เซอร์
                    และใช้เพื่อรับ-ส่งข้อความแทนเพจเท่านั้น เราไม่แก้ไขการตั้งค่าใด ๆ ของเพจ
                    ไม่โพสต์ในนามเพจ และไม่เข้าถึงข้อมูลเพจส่วนอื่น
                  </Typography>
                </li>
                <li>
                  <Typography variant='body2'>
                    เมื่อร้านกดถอดการเชื่อมต่อ เราจะแจ้ง Meta ให้หยุดส่งข้อความของเพจนั้นมายังเรา
                    ทันที และหยุดแสดงบทสนทนานั้นในระบบ
                  </Typography>
                </li>
                <li>
                  <Typography variant='body2'>
                    เราไม่ใช้ข้อมูลจากช่องทางเหล่านี้เพื่อการโฆษณา ไม่ขายต่อ
                    และไม่นำไปใช้นอกเหนือจากการให้ร้านคุยกับลูกค้าของตนเอง
                  </Typography>
                </li>
              </ul>
            </div>

            {/* หัวข้อ 6 — ผู้ช่วย AI (feature 00019) ระบุขอบเขตข้อมูลที่ส่งออกให้ชัด */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                6. ผู้ช่วย AI ร่างคำตอบ
              </Typography>
              <Typography variant='body2' className='mbe-3'>
                ร้านค้าเปิดใช้ผู้ช่วย AI เพื่อช่วยร่างข้อความตอบลูกค้าได้ (ปิดอยู่โดยค่าเริ่มต้น)
                เมื่อร้านกดขอคำแนะนำในบทสนทนาหนึ่ง เราส่งข้อมูลต่อไปนี้ไปประมวลผลที่ Google (Gemini):
              </Typography>
              <ul className='list-disc pli-6 flex flex-col gap-1'>
                <li>
                  <Typography variant='body2'>ข้อความล่าสุดในบทสนทนานั้น</Typography>
                </li>
                <li>
                  <Typography variant='body2'>
                    รายการสินค้าและราคาของร้าน และโน้ตที่ร้านจดไว้เกี่ยวกับลูกค้ารายนั้น
                    (เปิด/ปิดได้ในหน้าตั้งค่า)
                  </Typography>
                </li>
                <li>
                  <Typography variant='body2'>
                    ประวัติคำสั่งซื้อของลูกค้ารายนั้น เฉพาะวันที่ ยอดเงิน และสถานะ —
                    เบอร์โทรศัพท์ อีเมล และที่อยู่จัดส่ง ไม่ถูกส่งออกไป
                  </Typography>
                </li>
                <li>
                  <Typography variant='body2'>
                    ไฟล์แนบในบทสนทนา เฉพาะเมื่อร้านเปิดตัวเลือกนี้เอง
                  </Typography>
                </li>
              </ul>
              <Typography variant='body2' className='mbs-3'>
                ผลลัพธ์เป็นเพียงข้อความร่างที่แสดงให้ร้านเห็น — AI ไม่ส่งข้อความหาลูกค้าเอง
                ร้านต้องตรวจและกดส่งทุกครั้ง
              </Typography>
            </div>

            {/* หัวข้อ 7 */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                7. สิทธิ์ของผู้ใช้
              </Typography>
              <Typography variant='body2'>
                คุณมีสิทธิ์เข้าถึง แก้ไข และขอลบข้อมูลของคุณ — ดูวิธีที่หน้า{' '}
                {/* ทำไม RSC-safe: NextLink ห่อ Typography แทน component={Link} (Hard Rule 2) */}
                <NextLink href='/data-deletion' className='text-primary'>
                  การลบข้อมูลผู้ใช้
                </NextLink>
              </Typography>
            </div>

            {/* หัวข้อ 8 */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                8. การติดต่อ
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
