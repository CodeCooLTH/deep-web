// MUI Imports
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'

// Component Imports
import ScamSearchBar from '@views/front-pages/scam-check/ScamSearchBar'

// Styles
import frontCommonStyles from '@views/front-pages/styles.module.css'

const ScamCheck = () => {
  return (
    <section id='check' className='plb-8 md:plb-[100px] bg-backgroundDefault'>
      <div className={frontCommonStyles.layoutSpacing}>
        <div className='flex flex-col gap-y-4 items-center justify-center mbe-8 md:mbe-12'>
          <Chip size='small' variant='tonal' color='primary' label='เช็กก่อนโอน' />
          <div className='flex flex-col items-center gap-y-1 justify-center text-center'>
            <Typography color='text.primary' variant='h4' className='font-extrabold'>
              ตรวจก่อนโอน ลดเสี่ยงมิจฉาชีพ
            </Typography>
            <Typography className='max-is-[540px]'>
              ค้นด้วยเบอร์ ชื่อ เลขบัตรประชาชน หรือเลขบัญชี — เราแสดงแค่จำนวนครั้งที่ถูกรายงาน (ที่ตรวจสอบแล้ว) ไม่ตัดสิน ไม่เปิดเผยตัวบุคคล
            </Typography>
          </div>
        </div>

        <ScamSearchBar />
      </div>
    </section>
  )
}

export default ScamCheck
