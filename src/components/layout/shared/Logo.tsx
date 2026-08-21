'use client'

// React Imports
import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'

// Third-party Imports
import styled from '@emotion/styled'

// Type Imports
import type { VerticalNavContextProps } from '@menu/contexts/verticalNavContext'

// Component Imports
import logoDeepMark from '@/assets/images/logo-deep-mark.png'

// Config Imports
import themeConfig from '@configs/themeConfig'

// Hook Imports
import useVerticalNav from '@menu/hooks/useVerticalNav'
import { useSettings } from '@core/hooks/useSettings'

type LogoTextProps = {
  isHovered?: VerticalNavContextProps['isHovered']
  isCollapsed?: VerticalNavContextProps['isCollapsed']
  transitionDuration?: VerticalNavContextProps['transitionDuration']
  isBreakpointReached?: VerticalNavContextProps['isBreakpointReached']
  color?: CSSProperties['color']
}

const LogoText = styled.span<LogoTextProps>`
  color: ${({ color }) => color ?? 'var(--mui-palette-text-primary)'};
  font-size: 1.375rem;
  line-height: 1.09091;
  font-weight: 700;
  letter-spacing: 0.25px;
  transition: ${({ transitionDuration }) =>
    `margin-inline-start ${transitionDuration}ms ease-in-out, opacity ${transitionDuration}ms ease-in-out`};

  ${({ isHovered, isCollapsed, isBreakpointReached }) =>
    !isBreakpointReached && isCollapsed && !isHovered
      ? 'opacity: 0; margin-inline-start: 0;'
      : 'opacity: 1; margin-inline-start: 12px;'}
`

const Logo = ({ color }: { color?: CSSProperties['color'] }) => {
  // Refs
  const logoTextRef = useRef<HTMLSpanElement>(null)

  // Hooks
  const { isHovered, transitionDuration, isBreakpointReached } = useVerticalNav()
  const { settings } = useSettings()

  // Vars
  const { layout } = settings

  useEffect(() => {
    if (layout !== 'collapsed') {
      return
    }

    if (logoTextRef && logoTextRef.current) {
      if (!isBreakpointReached && layout === 'collapsed' && !isHovered) {
        logoTextRef.current?.classList.add('hidden')
      } else {
        logoTextRef.current.classList.remove('hidden')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHovered, layout, isBreakpointReached])

  return (
    <div className='flex items-center'>
      {/* 🛑 โลโก้ Deep ของจริง ไม่ใช่ `VuexyLogo` ของธีม — ตัวนั้นเป็นรูป "V" ที่ติดมากับ Vuexy
          และเป็นสิ่งเดียวกับที่ Apple ตีกลับ build 1.0(3) ด้วย Guideline 2.3.8 (ส่ง asset ของธีม
          ออกไปโดยไม่ได้เปลี่ยน) · ที่นี่มีคำว่า "Deep" จาก `LogoText` อยู่ข้าง ๆ อยู่แล้ว
          จึงใช้ **มาร์กตัว D** ไม่ใช่เวิร์ดมาร์กเต็ม ไม่งั้นจะได้คำว่า Deep สองครั้ง */}
      {/* eslint-disable-next-line @next/next/no-img-element -- โลโก้ static ที่ import มาแล้ว */}
      <img src={logoDeepMark.src} alt='' className='bs-6 is-auto' />
      <LogoText
        color={color}
        ref={logoTextRef}
        isHovered={isHovered}
        isCollapsed={layout === 'collapsed'}
        transitionDuration={transitionDuration}
        isBreakpointReached={isBreakpointReached}
      >
        {themeConfig.templateName}
      </LogoText>
    </div>
  )
}

export default Logo
