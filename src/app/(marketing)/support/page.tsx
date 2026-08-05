// Base: src/app/(marketing)/data-deletion/page.tsx (โครง section + title block + Divider +
//   callout `pli-5 plb-5 bg-actionHover rounded` เหมือนกันทั้งหน้า)
//   ซึ่ง chase ต่อไปที่ theme/vuexy/typescript-version/full-version/src/views/front-pages/help-center/Questions.tsx
// Adapted: เนื้อหาเป็นศูนย์ช่วยเหลือ/ติดต่อ แทนขั้นตอนขอลบข้อมูล
//
// ทำไมต้องมีหน้านี้: App Store Connect บังคับกรอก **Support URL** และ URL นั้นต้องเปิดได้จริง
// ก่อนหน้านี้ /support /contact /help คืน 404 ทั้งหมด (ตรวจ 2026-08-04) จึงไม่มี URL ให้กรอก
// Google Play ก็บังคับช่องเดียวกัน — หน้านี้ใช้ได้ทั้งสองสโตร์
//
// ทำไม mailto ใช้ plain <a>: next/link ไว้ navigate internal route — mailto ไม่ใช่ route
// (เหตุผลเดียวกับที่ data-deletion/page.tsx เขียนไว้)

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

// ห้าม noindex — Apple/Google crawler ต้องเข้าถึงได้เพื่อยืนยัน Support URL
export const metadata: Metadata = {
  title: 'ศูนย์ช่วยเหลือ — Deep',
  description:
    'ติดต่อทีมงาน Deep (deepthailand.app) สอบถามการใช้งาน แจ้งปัญหา ขอลบบัญชี และคำถามที่พบบ่อยสำหรับผู้ซื้อและผู้ขาย',
}

const SUPPORT_EMAIL = 'shinobu22@outlook.com'

/** คำถามที่พบบ่อย — เรียงตามสิ่งที่ผู้ใช้เปิดหน้านี้มาหาจริง ๆ ไม่ใช่ตามลำดับฟีเจอร์ */
const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: 'ลบบัญชีอย่างไร',
    a: (
      <>
        เข้าสู่ระบบแล้วกดลบได้ด้วยตัวเองทันที — <strong>ผู้ขาย</strong> ไปที่เมนู &quot;ร้านค้า&quot; →
        &quot;ข้อมูลส่วนตัว&quot; → เลื่อนลงล่างสุด · <strong>ผู้ซื้อ</strong> ไปที่ &quot;ตั้งค่าบัญชี&quot; →
        เลื่อนลงล่างสุด · ข้อมูลส่วนตัวจะถูกล้างออกจากระบบภายใน 30 วัน
      </>
    ),
  },
  {
    q: 'ลืมรหัสผ่าน เข้าระบบไม่ได้',
    a: 'กด "ลืมรหัสผ่าน" ที่หน้าเข้าสู่ระบบ ระบบจะส่งรหัส OTP ไปที่เบอร์โทรที่ผูกไว้ตอนสมัคร',
  },
  {
    q: 'เปลี่ยนเบอร์โทรได้ไหม',
    a: 'เบอร์โทรตั้งได้ครั้งเดียวและเปลี่ยนเองไม่ได้ เพราะผูกกับคะแนนความน่าเชื่อถือของบัญชี หากจำเป็นต้องเปลี่ยนจริง ๆ ให้ติดต่อทีมงานทางอีเมลด้านล่าง',
  },
  {
    q: 'ไม่ได้รับการแจ้งเตือนข้อความจากลูกค้า',
    a: 'ตรวจว่าอนุญาตการแจ้งเตือนให้แอปแล้วในตั้งค่าของเครื่อง และเข้าสู่ระบบค้างไว้ในแอป หากยังไม่ได้รับ ให้ออกจากระบบแล้วเข้าใหม่หนึ่งครั้งเพื่อลงทะเบียนอุปกรณ์ใหม่',
  },
  {
    q: 'สั่งซื้อแล้วยังไม่ได้รับของ',
    a: 'ติดต่อร้านค้าโดยตรงผ่านหน้าคำสั่งซื้อก่อนเป็นอันดับแรก หากติดต่อร้านไม่ได้หรือสงสัยว่าถูกหลอก แจ้งเราทางอีเมลพร้อมเลขคำสั่งซื้อ',
  },
  {
    q: 'ต้องการรายงานผู้ใช้หรือร้านค้าที่น่าสงสัย',
    a: 'ส่งอีเมลมาพร้อมชื่อผู้ใช้หรือลิงก์ร้าน และหลักฐานเท่าที่มี ทีมงานจะตรวจสอบและแจ้งผลกลับ',
  },
]

const SupportPage = () => {
  return (
    <FrontLayout>
      {/* section shell มาจาก data-deletion/page.tsx — คง bg-backgroundPaper + spacing pattern */}
      <section className='flex flex-col justify-center items-center gap-4 md:plb-[100px] plb-[50px] pbs-[70px] -mbs-[70px] bg-backgroundPaper'>
        <div className={classnames('pbs-10 md:pbs-16', frontCommonStyles.layoutSpacing)}>
          <div className='flex flex-col gap-2'>
            <Typography variant='h4'>ศูนย์ช่วยเหลือ</Typography>
            <Typography variant='caption' className='text-textSecondary'>
              อัปเดตล่าสุด 4 สิงหาคม 2569
            </Typography>
          </div>

          <Divider className='mlb-6' />

          <div className='flex flex-col gap-6'>
            <Typography variant='body1'>
              มีคำถามหรือพบปัญหาการใช้งาน Deep ทั้งฝั่งผู้ซื้อและผู้ขาย ติดต่อทีมงานได้โดยตรงตามช่องทางด้านล่าง
            </Typography>

            {/* 1. ติดต่อ — ขึ้นก่อนทุกอย่าง เพราะคนเปิดหน้า support ส่วนใหญ่มาหาช่องทางติดต่อ
                ไม่ได้มาอ่าน FAQ (ถ้าอ่าน FAQ แล้วแก้ได้ เขาคงไม่มาถึงหน้านี้) */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                1. ติดต่อทีมงาน
              </Typography>
              <div className='pli-5 plb-5 bg-actionHover rounded'>
                <Typography variant='body2' className='mbe-2'>
                  ส่งอีเมลมาที่:
                </Typography>
                <a href={`mailto:${SUPPORT_EMAIL}`}>
                  <Typography variant='h6' color='primary'>
                    {SUPPORT_EMAIL}
                  </Typography>
                </a>
                <Typography variant='body2' className='mbs-2 text-textSecondary'>
                  แจ้งชื่อผู้ใช้ (username) หรือเบอร์โทรที่ใช้สมัคร พร้อมรายละเอียดปัญหาและภาพหน้าจอถ้ามี
                  จะช่วยให้ตรวจสอบได้เร็วขึ้น
                </Typography>
                <Typography variant='body2' className='mbs-2 text-textSecondary'>
                  เราตอบกลับภายใน 3 วันทำการ
                </Typography>
              </div>
            </div>

            {/* 2. FAQ */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                2. คำถามที่พบบ่อย
              </Typography>
              <div className='flex flex-col gap-4'>
                {FAQS.map((item) => (
                  <div key={item.q}>
                    <Typography variant='subtitle2' className='mbe-1'>
                      {item.q}
                    </Typography>
                    <Typography variant='body2' className='text-textSecondary'>
                      {item.a}
                    </Typography>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. ลิงก์ที่เกี่ยวข้อง — Apple/Google ตรวจว่าหน้า support โยงไปหน้านโยบายได้ไหม
                และผู้ใช้ที่มาหาเรื่อง "ลบข้อมูล" มักเข้าหน้านี้ก่อนเสมอ */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                3. ข้อมูลที่เกี่ยวข้อง
              </Typography>
              <div className='flex flex-wrap gap-3'>
                <Button variant='tonal' color='secondary' href='/privacy'>
                  นโยบายความเป็นส่วนตัว
                </Button>
                <Button variant='tonal' color='secondary' href='/terms'>
                  ข้อกำหนดการใช้บริการ
                </Button>
                <Button variant='tonal' color='secondary' href='/data-deletion'>
                  การลบข้อมูลผู้ใช้
                </Button>
              </div>
            </div>

            {/* 4. ผู้ให้บริการ — ต้องตรงกับหน้า privacy/terms/data-deletion ทุกตัวอักษร
                (ผู้ควบคุมข้อมูลคนเดียวกัน ถ้าไม่ตรงจะดูเหมือนคนละนิติบุคคล) */}
            <div>
              <Typography variant='h6' className='mbe-3'>
                4. ผู้ให้บริการ
              </Typography>
              <Typography variant='body2'>
                ผู้ควบคุมข้อมูลส่วนบุคคล: <strong>Sekson Oonnom</strong> (บุคคลธรรมดา) ประเทศไทย
              </Typography>
            </div>
          </div>
        </div>
      </section>
    </FrontLayout>
  )
}

export default SupportPage
