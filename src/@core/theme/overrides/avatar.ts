// MUI Imports
import type { Theme } from '@mui/material/styles'

const avatar: Theme['components'] = {
  MuiAvatarGroup: {
    styleOverrides: {
      root: ({ theme }) => ({
        justifyContent: 'flex-end',
        '& .MuiAvatar-root': {
          borderColor: 'var(--mui-palette-background-paper)'
        },
        '&.pull-up .MuiAvatar-root': {
          cursor: 'pointer',
          transition: theme.transitions.create(['box-shadow', 'transform'], {
            easing: 'ease',
            duration: theme.transitions.duration.shorter
          }),
          '&:hover': {
            zIndex: 2,
            boxShadow: 'var(--mui-customShadows-md)',
            transform: 'translateY(-5px)'
          }
        }
      })
    }
  },
  MuiAvatar: {
    styleOverrides: {
      root: ({ theme }) => ({
        color: 'var(--mui-palette-text-primary)',
        fontSize: theme.typography.body1.fontSize,
        lineHeight: 1.2
      }),
      /**
       * DESIGN.md §Shapes — อวตาร/รูปย่อแบบ `rounded` เป็น **ภาชนะ** จึงใช้ 8px
       * (ปุ่ม/อินพุตคือ 6px — เอกสารเขียนเองว่าความต่าง 6 vs 8 คือสิ่งที่แยกสองอย่างนี้)
       *
       * เดิม MUI ให้ variant นี้รับ `shape.borderRadius` (6px) มาตรง ๆ ⇒ รูปย่อสินค้า
       * บนหน้าออเดอร์กลมเท่าปุ่มข้าง ๆ ขณะที่รูปย่อบนหน้าร้านตั้ง 8px เอง — ของอย่าง
       * เดียวกันคนละค่าบนสองหน้าที่ผู้ซื้อเดินสลับไปมา
       */
      rounded: {
        borderRadius: 8
      }
    }
  }
}

export default avatar
