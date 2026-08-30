// MUI Imports
import type { Theme } from '@mui/material/styles'

// Type Imports
import type { Skin } from '@core/types'

const card = (skin: Skin): Theme['components'] => {
  return {
    MuiCard: {
      defaultProps: {
        ...(skin === 'bordered' && {
          variant: 'outlined'
        })
      },
      styleOverrides: {
        root: ({ ownerState }) => ({
          /**
           * มุมการ์ด = 12px — **นิยามเดียวของทั้งสกิน buyer/public** (user เคาะ 2026-08-30)
           *
           * ก่อนหน้านี้ `<Card>` รับ `shape.borderRadius` (6px) มาตรง ๆ ขณะที่หน้าโปรไฟล์ร้าน
           * `/b` กับ `/u` ประกอบการ์ดเองด้วย `div` แล้วตั้ง 12px ⇒ การ์ดของสองหน้าที่ผู้ซื้อ
           * เดินสลับไปมา (หน้าร้าน ↔ หน้าออเดอร์) กลมไม่เท่ากันเป็นเท่าตัว
           *
           * 🛑 ห้ามแก้ด้วยการขยับ `shape.borderRadius` — ค่านั้นเป็น **ตัวคูณ** ของ
           * `borderRadius: N` ทุกตัวใน `sx` ทั้งระบบ (2 = 12px วันนี้ จะกลายเป็น 24px ทันที)
           * ที่ถูกคือ override เฉพาะ MuiCard อย่างที่ทำอยู่นี่
           */
          borderRadius: 12,
          ...(ownerState.variant !== 'outlined' && {
            boxShadow: 'var(--mui-customShadows-md)'
          })
        })
      }
    },
    MuiCardHeader: {
      styleOverrides: {
        root: ({ theme }) => ({
          /**
           * padding การ์ด = **20px** ทั้งฝั่ง buyer (user เคาะ 2026-08-30) — เดิม 24px
           *
           * `theme.spacing(5)` = 5 × 4px · นิยามเดียวสำหรับ Header/Content/Actions
           * ⇒ `<Card>` ทุกใบในสกิน `(marketing)` ได้ค่าเดียวกันโดยไม่ต้องไล่แก้ทีละหน้า
           *
           * 🛑 เปลี่ยนตรงนี้ที่เดียว — ห้ามไปเขียน `p: N` ทับบนการ์ดรายใบ
           */
          padding: theme.spacing(5),
          '& + .MuiCardContent-root, & + .MuiCardActions-root': {
            paddingBlockStart: 0
          },
          '& + .MuiCollapse-root .MuiCardContent-root:first-child, & + .MuiCollapse-root .MuiCardActions-root:first-child':
            {
              paddingBlockStart: 0
            }
        }),
        subheader: ({ theme }) => ({
          ...theme.typography.subtitle1,
          color: 'rgb(var(--mui-palette-text-primaryChannel) / 0.55)'
        }),
        action: ({ theme }) => ({
          ...theme.typography.body1,
          color: 'var(--mui-palette-text-disabled)',
          marginBlock: 0,
          marginInlineEnd: 0,
          '& .MuiIconButton-root': {
            color: 'inherit'
          }
        })
      }
    },
    MuiCardContent: {
      styleOverrides: {
        root: ({ theme }) => ({
          padding: theme.spacing(5),
          color: 'var(--mui-palette-text-secondary)',
          '&:last-child': {
            paddingBlockEnd: theme.spacing(5)
          },
          '& + .MuiCardHeader-root, & + .MuiCardContent-root, & + .MuiCardActions-root': {
            paddingBlockStart: 0
          },
          '& + .MuiCollapse-root .MuiCardHeader-root:first-child, & + .MuiCollapse-root .MuiCardContent-root:first-child, & + .MuiCollapse-root .MuiCardActions-root:first-child':
            {
              paddingBlockStart: 0
            }
        })
      }
    },
    MuiCardActions: {
      styleOverrides: {
        root: ({ theme }) => ({
          padding: theme.spacing(5),
          '& .MuiButtonBase-root:not(:first-of-type)': {
            marginInlineStart: theme.spacing(4)
          },
          '&:where(.card-actions-dense)': {
            padding: theme.spacing(3),
            '& .MuiButton-text': {
              paddingInline: theme.spacing(3)
            }
          },
          '& + .MuiCardHeader-root, & + .MuiCardContent-root, & + .MuiCardActions-root': {
            paddingBlockStart: 0
          },
          '& + .MuiCollapse-root .MuiCardHeader-root:first-child, & + .MuiCollapse-root .MuiCardContent-root:first-child, & + .MuiCollapse-root .MuiCardActions-root:first-child':
            {
              paddingBlockStart: 0
            }
        })
      }
    }
  }
}

export default card
