// Base: theme/vuexy/typescript-version/full-version/src/views/front-pages/help-center/Questions.tsx
// Adapted: ตัด Grid 2-column (sidebar, search, article list) ออก → single-column อ่านง่าย mobile-first
// Stripped deps: Breadcrumbs, Link (Vuexy), DirectionalIcon, CustomTextField, InputAdornment, Grid
// ทำไม RSC-safe nav: crosslink ใช้ NextLink ห่อ Typography แทน component={Link} (Hard Rule 2)

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
// ห้าม noindex — Meta crawler ต้องเข้าถึงเพื่อยืนยัน Terms of Service URL
export const metadata: Metadata = {
  title: 'ข้อกำหนดการใช้บริการ — Deep',
  description:
    'ข้อกำหนดและเงื่อนไขการใช้บริการแพลตฟอร์ม Deep (deepthailand.app) — ระบบสร้างความน่าเชื่อถือสำหรับการซื้อขายออนไลน์',
}

// ทำไม: Server Component — ไม่มี auth gate ไม่มี data fetch เหมาะกับ static page
const TermsPage = () => {
  return (
    <FrontLayout>
      {/* section shell มาจาก Questions.tsx — คง bg-backgroundPaper + spacing pattern */}
      <section className='flex flex-col justify-center items-center gap-4 md:plb-[100px] plb-[50px] pbs-[70px] -mbs-[70px] bg-backgroundPaper'>
        <div className={classnames('pbs-10 md:pbs-16', frontCommonStyles.layoutSpacing)}>
          {/* title block — pattern เดียวกับ Questions.tsx: flex-col gap-2 → Divider */}
          <div className='flex flex-col gap-2'>
            <Typography variant='h4'>ข้อกำหนดการใช้บริการ (Terms of Service)</Typography>
            <Typography variant='caption' className='text-textSecondary'>
              อัปเดตล่าสุด 17 มิถุนายน 2569
            </Typography>
          </div>

          <Divider className='mlb-6' />

          <div className='flex flex-col gap-6'>
            {/* คำนำ */}
            <Typography variant='body1'>
              ข้อกำหนดนี้เป็นข้อตกลงระหว่างคุณ (&quot;ผู้ใช้&quot;) กับ Deep (&quot;เรา&quot;) ในการใช้งานแพลตฟอร์ม
              Deep (deepthailand.app) การเข้าใช้หรือสมัครบัญชีถือว่าคุณยอมรับข้อกำหนดทั้งหมดนี้
            </Typography>

            {/* หัวข้อ 1 */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                1. การยอมรับข้อกำหนด
              </Typography>
              <Typography variant='body2'>
                เมื่อคุณสมัครบัญชีหรือใช้บริการของ Deep ถือว่าคุณได้อ่าน เข้าใจ และยอมรับข้อกำหนดนี้
                รวมถึง <NextLink href='/privacy' className='text-primary'>นโยบายความเป็นส่วนตัว</NextLink> ของเรา
                หากคุณไม่ยอมรับ กรุณาหยุดใช้บริการ
              </Typography>
            </div>

            {/* หัวข้อ 2 */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                2. คำอธิบายบริการ
              </Typography>
              <Typography variant='body2'>
                Deep เป็นแพลตฟอร์มสร้างความน่าเชื่อถือสำหรับการซื้อขายออนไลน์ ผ่านการยืนยันตัวตน คะแนนความน่าเชื่อถือ
                (Trust Score) เหรียญตรา (Badge) และประวัติการซื้อขาย เพื่อช่วยลดความเสี่ยงจากการถูกหลอกลวง
                Deep เป็น &quot;ตัวกลางสร้างความน่าเชื่อถือ&quot; ไม่ใช่คู่สัญญาในการซื้อขายระหว่างผู้ใช้
              </Typography>
            </div>

            {/* หัวข้อ 3 */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                3. บัญชีผู้ใช้และการยืนยันตัวตน
              </Typography>
              <ul className='list-disc pli-6 flex flex-col gap-1'>
                <li>
                  <Typography variant='body2'>
                    คุณต้องให้ข้อมูลที่ถูกต้องและเป็นจริงในการสมัครและยืนยันตัวตน
                  </Typography>
                </li>
                <li>
                  <Typography variant='body2'>
                    คุณรับผิดชอบในการรักษาความลับของรหัสผ่านและกิจกรรมที่เกิดขึ้นภายใต้บัญชีของคุณ
                  </Typography>
                </li>
                <li>
                  <Typography variant='body2'>
                    หนึ่งคนควรมีบัญชีเดียว ห้ามแอบอ้างเป็นบุคคลอื่นหรือสร้างบัญชีปลอม
                  </Typography>
                </li>
              </ul>
            </div>

            {/* หัวข้อ 4 */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                4. กฎการใช้งานและข้อห้าม
              </Typography>
              <ul className='list-disc pli-6 flex flex-col gap-1'>
                <li>
                  <Typography variant='body2'>
                    ห้ามใช้ Deep เพื่อการฉ้อโกง หลอกลวง ฟอกเงิน หรือกิจกรรมที่ผิดกฎหมาย
                  </Typography>
                </li>
                <li>
                  <Typography variant='body2'>
                    ห้ามให้ข้อมูลเท็จ ปลอมแปลงเอกสารยืนยันตัวตน หรือปั่นคะแนนความน่าเชื่อถือ/รีวิว
                  </Typography>
                </li>
                <li>
                  <Typography variant='body2'>
                    ห้ามขายสินค้า/บริการที่ผิดกฎหมายหรือละเมิดสิทธิ์ของผู้อื่น
                  </Typography>
                </li>
              </ul>
            </div>

            {/* หัวข้อ 5 */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                5. การซื้อขายและความรับผิดชอบ
              </Typography>
              <Typography variant='body2'>
                การซื้อขายเกิดขึ้นโดยตรงระหว่างผู้ซื้อและผู้ขาย Deep ทำหน้าที่ให้ข้อมูลและเครื่องมือสร้างความน่าเชื่อถือเท่านั้น
                ไม่ได้เป็นผู้ขาย ผู้ผลิต หรือผู้รับประกันสินค้า/บริการ ผู้ใช้ต้องใช้วิจารณญาณในการตัดสินใจซื้อขายเอง
                คะแนนความน่าเชื่อถือเป็นเพียงข้อมูลประกอบ ไม่ใช่การรับประกันผลการซื้อขาย
              </Typography>
            </div>

            {/* หัวข้อ 6 */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                6. ทรัพย์สินทางปัญญา
              </Typography>
              <Typography variant='body2'>
                เครื่องหมายการค้า โลโก้ และเนื้อหาของแพลตฟอร์ม Deep เป็นทรัพย์สินของเรา ห้ามนำไปใช้โดยไม่ได้รับอนุญาต
                เนื้อหาที่คุณอัปโหลด (เช่น รูปสินค้า รีวิว) ยังเป็นของคุณ แต่คุณอนุญาตให้ Deep ใช้เพื่อให้บริการแพลตฟอร์ม
              </Typography>
            </div>

            {/* หัวข้อ 7 */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                7. การจำกัดความรับผิด
              </Typography>
              <Typography variant='body2'>
                Deep ให้บริการตามสภาพ (&quot;as is&quot;) เท่าที่กฎหมายอนุญาต เราไม่รับผิดต่อความเสียหายที่เกิดจากการซื้อขายระหว่างผู้ใช้
                การใช้ข้อมูลบนแพลตฟอร์ม หรือเหตุขัดข้องของบริการ
              </Typography>
            </div>

            {/* หัวข้อ 8 */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                8. การระงับและยกเลิกบัญชี
              </Typography>
              <Typography variant='body2'>
                เราขอสงวนสิทธิ์ในการระงับหรือยกเลิกบัญชีที่ละเมิดข้อกำหนดนี้ คุณสามารถขอลบบัญชีและข้อมูลได้ที่หน้า{' '}
                <NextLink href='/data-deletion' className='text-primary'>การลบข้อมูลผู้ใช้</NextLink>
              </Typography>
            </div>

            {/* หัวข้อ 9 */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                9. การเปลี่ยนแปลงข้อกำหนดและกฎหมายที่ใช้บังคับ
              </Typography>
              <Typography variant='body2'>
                เราอาจปรับปรุงข้อกำหนดนี้เป็นครั้งคราว การใช้บริการต่อไปถือว่าคุณยอมรับข้อกำหนดที่ปรับปรุงแล้ว
                ข้อกำหนดนี้อยู่ภายใต้กฎหมายของประเทศไทย
              </Typography>
            </div>

            {/* หัวข้อ 10 */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                10. การติดต่อ
              </Typography>
              <Typography variant='body2'>
                หากมีคำถามเกี่ยวกับข้อกำหนดนี้ ติดต่อ:{' '}
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

export default TermsPage
