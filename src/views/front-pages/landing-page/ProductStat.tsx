// React Imports
import { Fragment } from 'react'

// MUI Imports
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'

// Third-party Imports
import classnames from 'classnames'

// Styles Imports
import frontCommonStyles from '@views/front-pages/styles.module.css'

// Type
type StatData = {
  label: string
  value: string
  unit: string
  icon: string
  color: string
}

const ProductStat = ({ shopCount }: { shopCount: number }) => {
  // Data — ตัวแรกดึงของจริงจาก DB (จำนวนร้านค้า), อีกสองตัวเป็น mock
  const statData: StatData[] = [
    {
      label: 'ธุรกิจที่ใช้งานเราอยู่',
      value: `${shopCount.toLocaleString('th-TH')}+`,
      unit: 'บริษัท',
      icon: 'tabler-building-store',
      color: 'var(--mui-palette-primary-main)'
    },
    {
      label: 'คำสั่งซื้อที่ยืนยันแล้ว',
      value: '453,120+',
      unit: 'รายการ',
      icon: 'tabler-receipt',
      color: 'var(--mui-palette-warning-main)'
    },
    {
      // mock ที่เกี่ยวข้องกับ Deep — ป้องกันมิจฉาชีพ (ผูกกับ value prop ของแพลตฟอร์ม)
      label: 'ป้องกันเคสมิจฉาชีพไปแล้ว',
      value: '12,480+',
      unit: 'เคส',
      icon: 'tabler-shield-check',
      color: 'var(--mui-palette-success-main)'
    }
  ]

  return (
    <section className='relative plb-6 md:plb-[84px] bg-backgroundPaper overflow-hidden'>
      <div className={classnames('relative', frontCommonStyles.layoutSpacing)}>
        {/**
         * มือถือ = **การ์ดละหนึ่งสถิติ** — ไอคอนซ้าย · ป้าย+หน่วยกลาง · ตัวเลขขวา
         *
         * ใช้ผิวการ์ดของระบบเต็มรูป (รัศมี 12px · padding 20px · พื้น paper · เงา)
         * ไม่ใช่แถวลอยหรือไทล์ครึ่ง ๆ กลาง ๆ ⇒ อ่านเป็นชุดเดียวกับการ์ดอื่นทั้งเว็บ
         *
         * ผ่านมา 4 ผัง หัวหน้าตีกลับหมด — ต้นเหตุร่วมคือ **บังคับป้ายไทยที่ยาวไม่เท่ากัน
         * ให้อยู่ในช่องกว้างเท่ากัน** (เรียงจัดกลางสูง 525px · กริด 2 คอลัมน์ตัวที่ 3 โดด ·
         * กริด 3 คอลัมน์ตัดบรรทัดคนละที่) · ผังการ์ดต่อแถวไม่มีปัญหานั้น เพราะป้ายได้
         * ความกว้างเต็มบรรทัด ยาวแค่ไหนก็บรรทัดเดียว
         *
         * ตั้งแต่ sm ขึ้นไปถอดผิวการ์ดออก กลับเป็นแถวเดียวสามคอลัมน์พร้อมเส้นคั่นเหมือนเดิม
         */}
        <div className='flex flex-col gap-4 sm:flex-row sm:items-stretch sm:justify-center sm:gap-0'>
          {statData.map((stat, index) => (
            <Fragment key={index}>
              {index > 0 && <Divider flexItem orientation='vertical' className='hidden sm:block' />}
              <div className='flex flex-1 items-center gap-4 p-5 rounded-2xl bg-[var(--mui-palette-background-paper)] border border-[color:var(--mui-palette-divider)] text-start sm:border-0 sm:bg-transparent sm:p-0 sm:flex-col sm:items-center sm:justify-start sm:gap-y-2 sm:text-center sm:plb-6 sm:pli-6'> {/* carve-out padding: `p-5` คือ padding การ์ดตามกฎ · ส่วน `sm:plb-6 sm:pli-6` ใช้ตอนที่ถอดผิวการ์ดออกแล้ว (ไม่มีขอบ/พื้น) = ระยะของคอลัมน์ ไม่ใช่ขอบในของการ์ด */}
                {/* แผ่นไอคอนย้อมสีของสถิตินั้น 14% — `color-mix` กับสีเดิม ไม่ตั้งเฉดใหม่
                    (Hue-Preserving: ปรับได้แค่ความเข้ม) · 8px = แผ่นไอคอนตามบันได */}
                <span
                  aria-hidden='true'
                  className='shrink-0 grid place-items-center is-11 bs-11 rounded-lg sm:is-auto sm:bs-auto sm:rounded-none sm:bg-transparent'
                  style={{
                    color: stat.color,
                    background: `color-mix(in srgb, ${stat.color} 14%, transparent)`,
                  }}
                >
                  {/* 🛑 ขนาดต้องอยู่บน `<i>` ไม่ใช่ span ที่ครอบ — คลาส `.tabler-*` ตั้ง
                      `font-size: 24px` ของตัวเองไว้ ⇒ วางที่ตัวครอบแล้วไม่ตกทอดลงมา */}
                  <i className={classnames(stat.icon, 'text-[1.375rem] sm:text-[2.5rem]')} />
                </span>

                {/* จองที่ 2 บรรทัดให้ป้าย ⇒ การ์ดทั้งสามใบสูงเท่ากัน
                    ป้ายไทยยาวไม่เท่ากัน ("ป้องกันเคสมิจฉาชีพไปแล้ว" ตกสองบรรทัด อีกสองใบ
                    บรรทัดเดียว) ถ้าไม่จองที่ การ์ดใบที่สามจะสูงกว่าเพื่อนอยู่ใบเดียว */}
                <div className='min-is-0 flex-1 min-bs-[4.1em] flex flex-col justify-center sm:min-bs-0 sm:block sm:contents'>
                  <Typography className='font-medium text-[15px] leading-snug sm:text-[color:var(--mui-palette-text-secondary)]'>
                    {stat.label}
                  </Typography>
                  <Typography color='text.secondary' className='text-[13px] mbs-0.5 sm:hidden'>
                    {stat.unit}
                  </Typography>
                </div>

                {/* Metric (DESIGN.md §Metric) — ตัวเลขที่ทำหน้าที่เป็น *ภาพ* ไม่ใช่ข้อความ */}
                <Typography
                  component='p'
                  className='font-extrabold tabular-nums text-[22px] sm:text-[32px] leading-tight shrink-0'
                  style={{ color: stat.color, letterSpacing: '-0.01em' }}
                >
                  {stat.value}
                </Typography>
                <Typography color='text.secondary' className='font-medium hidden sm:block'>
                  {stat.unit}
                </Typography>
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  )
}

export default ProductStat
