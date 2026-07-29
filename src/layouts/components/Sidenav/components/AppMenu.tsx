import Icon from '@/components/wrappers/Icon'
import { menuItems as defaultMenuItems } from '@/layouts/components/data'
import type { MenuItemType } from '@/types'
import { cn } from '@/utils/helpers'
import { scrollToElement } from '@/utils/layout'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState } from 'react'

/**
 * URL ของเมนูที่ "ตรงกับ path ปัจจุบันมากที่สุด" — มีตัวเดียวเสมอ
 *
 * WARNING: เดิมเมนูใช้ `pathname.startsWith(item.url)` ล้วน ทำให้เมนูที่ URL เป็นคำนำหน้าของอีกอัน
 * สว่างพร้อมกัน เช่นอยู่ที่ /settings/auto-reply แล้ว "บัญชีที่เชื่อมต่อ" (/settings) สว่างด้วย
 * (บั๊กจริงที่ user เห็นบน prod 2026-07-29 — มีมาก่อนตั้งแต่ /settings/ai ของ feature 00019)
 *
 * แก้เป็น "ตรงที่สุดชนะ": เทียบทุก URL ในเมนูแล้วเลือกอันที่ยาวที่สุดที่ยัง match
 * ผลข้างเคียงที่ตั้งใจ: /products ยังสว่างตอนอยู่ /products/123 (ไม่มีเมนูอื่นที่ยาวกว่าและ match)
 */
const BestMatchContext = createContext<string | null>(null)

/** match ตามขอบเขต segment — กัน /settings ไปติดกับ /settings-foo */
function pathMatches(pathname: string, url: string) {
  return pathname === url || pathname.startsWith(url.endsWith('/') ? url : `${url}/`)
}

function collectUrls(items: MenuItemType[]): string[] {
  return items.flatMap((i) => [...(i.url ? [i.url] : []), ...(i.children ? collectUrls(i.children) : [])])
}

const MenuItemWithChildren = ({ item, openMenuKey, setOpenMenuKey, level = 0 }: { item: MenuItemType; openMenuKey: string | null; setOpenMenuKey: (key: string | null) => void; level?: number }) => {
  const pathname = usePathname()
  const isTopLevel = level === 0

  const [localOpen, setLocalOpen] = useState(false)
  const [didAutoOpen, setDidAutoOpen] = useState(false)

  const isChildActive = useCallback(
    function checkChildren(children: MenuItemType[] = []): boolean {
      return children.some((child) => (child.url && pathname.startsWith(child.url)) || (child.children && checkChildren(child.children)))
    },
    [pathname]
  )

  const isActive = (item.url && pathname.startsWith(item.url)) || isChildActive(item.children)

  const isOpen = isTopLevel ? openMenuKey === item.slug : localOpen

  useEffect(() => {
    if (isActive && !didAutoOpen) {
      if (isTopLevel) {
        setOpenMenuKey(item.slug)
      } else {
        setLocalOpen(true)
      }
      setDidAutoOpen(true)
    }
  }, [isActive, didAutoOpen, isTopLevel, item.slug, setOpenMenuKey])

  const toggleOpen = (e: React.MouseEvent) => {
    if (item.children?.length) e.preventDefault()
    if (isTopLevel) {
      setOpenMenuKey(isOpen ? null : item.slug)
    } else {
      setLocalOpen((prev) => !prev)
    }
  }

  return (
    <li
      className={cn('menu-item hs-accordion', {
        active: isActive,
      })}
    >
      <Link href={item.url ?? '#'} onClick={toggleOpen} className={cn('hs-accordion-toggle menu-link', isActive && 'active')} aria-expanded={isOpen}>
        {item.icon && isTopLevel && (
          <span className="menu-icon">
            <Icon icon={item.icon} />
          </span>
        )}
        <span className="menu-text">{item.label}</span>
        {item.badge ? <span className={cn('badge text-white', item.badge.className)}>{item.badge.text}</span> : <span className="menu-arrow" />}
      </Link>

      <ul className={cn('sub-menu hs-accordion-content hs-accordion-group', { 'hidden': !isOpen })}>
        {(item.children || []).map((child) => (child.children ? <MenuItemWithChildren key={child.slug} item={child} openMenuKey={openMenuKey} setOpenMenuKey={setOpenMenuKey} level={level + 1} /> : <MenuItem key={child.slug} item={child} level={level + 1} />))}
      </ul>
    </li>
  )
}

const MenuItem = ({ item, level = 0 }: { item: MenuItemType; level?: number }) => {
  const isTopLevel = level === 0

  // สว่างเฉพาะเมนูที่ตรงที่สุด — ไม่ใช่ทุกอันที่ URL เป็นคำนำหน้า (ดู BestMatchContext ด้านบน)
  const bestMatch = useContext(BestMatchContext)
  const isActive = !!item.url && item.url === bestMatch
  if (!item.url) return null
  return (
    <li className={cn('menu-item', isActive && 'active')}>
      <Link href={item.url ?? '/'} className={cn('menu-link', isActive && 'active', item.isDisabled && 'disabled', item.isSpecial && 'special-menu')}>
        {item.icon && isTopLevel && (
          <span className="menu-icon">
            <Icon icon={item.icon} />
          </span>
        )}
        <span className="menu-text">{item.label}</span>
        {item.badge && <span className={cn('badge text-white', item.badge.className)}>{item.badge.text}</span>}
      </Link>
    </li>
  )
}

const AppMenu = ({ items = defaultMenuItems }: { items?: MenuItemType[] }) => {
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null)
  const pathname = usePathname()

  // หา URL ที่ตรงกับ path ปัจจุบันมากที่สุดครั้งเดียวที่ระดับบนสุด แล้วส่งลงไปให้ทุกรายการเทียบ
  // (ถ้าให้แต่ละรายการตัดสินเอง มันไม่รู้ว่ามีเมนูอื่นที่ตรงกว่าอยู่)
  const bestMatch = useMemo(() => {
    const candidates = collectUrls(items).filter((u) => pathMatches(pathname, u))
    if (candidates.length === 0) return null
    return candidates.reduce((a, b) => (b.length > a.length ? b : a))
  }, [items, pathname])
  const scrollToActiveLink = () => {
    const activeItem: HTMLAnchorElement | null = document.querySelector('.menu-link.active')
    if (activeItem) {
      const simpleBarContent = document.querySelector('#sidenav-menu .simplebar-content-wrapper')
      if (simpleBarContent) {
        const offset = activeItem.offsetTop - window.innerHeight * 0.4
        scrollToElement(simpleBarContent, offset, 500)
      }
    }
  }
  useEffect(() => {
    setTimeout(scrollToActiveLink, 150)
  }, [])

  return (
    <BestMatchContext.Provider value={bestMatch}>
    <ul className="side-nav hs-accordion-group px-2.5 pb-16.5">
      {items.map((item, idx) => (
        <Fragment key={idx}>
          {item.isTitle && (
            <li className="menu-title mt-0!">
              {' '}
              <span>{item.label}</span>
            </li>
          )}
          {(item.children || [item]).map((item, idx) => (
            <Fragment key={idx}>{item.children ? <MenuItemWithChildren key={item.slug} item={item} openMenuKey={openMenuKey} setOpenMenuKey={setOpenMenuKey} /> : <MenuItem key={item.slug} item={item} />}</Fragment>
          ))}
        </Fragment>
      ))}
    </ul>
    </BestMatchContext.Provider>
  )
}

export default AppMenu
