'use client'

// NOTE: `choices.js` reaches for `document` at module evaluation time, so a
// static top-level import throws on the server in Next.js App Router (even
// in 'use client' components, the module is still evaluated during SSR).
// Load it lazily inside useEffect so it only runs in the browser.
//
// CSS: ไม่ import choices.min.css ที่นี่ — app.css โหลด base (choices.min.css) + Paces override
// (plugins/_choice.css) ตามลำดับถูกต้องแล้ว. ถ้า import ซ้ำที่นี่ default css จะโหลดทับ override
// → dropdown หลุดสไตล์ธีม (bug ที่ user เจอ 2026-06-16). ใช้ ChoiceSelect เฉพาะใต้ (paces) ที่มี app.css.
import type Choices from 'choices.js'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

export type ChoiceOption = {
  value: string
  label: string
  disabled?: boolean
}

export type ChoiceGroup = {
  label: string
  disabled?: boolean
  options: ChoiceOption[]
}

export type ChoiceSelectProps = {
  options?: ChoiceOption[]
  groups?: ChoiceGroup[]
  placeholder?: string
  search?: boolean
  removeItem?: boolean
  sorting?: boolean
  multiple?: boolean
  limit?: number
  disabled?: boolean
  value?: string | string[]
  defaultValue?: string | string[]
  onChange?: (value: string | string[]) => void
  id?: string
  name?: string
  className?: string
  ariaLabel?: string
}

export type ChoiceSelectRef = {
  getValue: () => string | string[]
  setValue: (v: string | string[]) => void
}

const ChoiceSelect = forwardRef<ChoiceSelectRef, ChoiceSelectProps>(function ChoiceSelect(
  {
    options = [],
    groups,
    placeholder,
    search = true,
    removeItem = false,
    sorting = false,
    multiple = false,
    limit,
    disabled = false,
    value,
    defaultValue,
    onChange,
    id,
    name,
    className,
    ariaLabel,
  },
  ref,
) {
  const selectRef = useRef<HTMLSelectElement | null>(null)
  const instanceRef = useRef<Choices | null>(null)

  useImperativeHandle(ref, () => ({
    getValue: () => (instanceRef.current?.getValue(true) as string | string[]) ?? '',
    setValue: (v) => {
      if (!instanceRef.current) return
      if (Array.isArray(v)) instanceRef.current.setChoiceByValue(v)
      else instanceRef.current.setChoiceByValue([v])
    },
  }))

  // Init once — dynamic import keeps Choices.js out of the SSR bundle.
  useEffect(() => {
    if (!selectRef.current) return
    const el = selectRef.current
    let cancelled = false
    let instance: Choices | null = null

    const listener = (e: Event) => {
      if (!instanceRef.current) return
      const v = (e.target as HTMLSelectElement).value
      onChange?.(
        multiple
          ? (instanceRef.current.getValue(true) as string[])
          : v,
      )
    }

    import('choices.js').then(({ default: Choices }) => {
      if (cancelled || !selectRef.current) return
      instance = new Choices(selectRef.current, {
        placeholderValue: placeholder,
        searchEnabled: search,
        removeItemButton: removeItem,
        shouldSort: sorting,
        maxItemCount: limit,
        allowHTML: false,
        shouldSortItems: false,
      })
      instanceRef.current = instance
      if (disabled) instance.disable()
      el.addEventListener('change', listener)
    })

    return () => {
      cancelled = true
      el.removeEventListener('change', listener)
      instance?.destroy()
      instanceRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep external value in sync (one-way controlled)
  useEffect(() => {
    if (!instanceRef.current || value === undefined) return
    const current = instanceRef.current.getValue(true)
    const target = Array.isArray(value) ? value : [value]
    const same = Array.isArray(current)
      ? current.length === target.length && current.every((v, i) => v === target[i])
      : current === value
    if (!same) {
      instanceRef.current.setChoiceByValue(target)
    }
  }, [value])

  return (
    <select
      ref={selectRef}
      id={id}
      name={name}
      multiple={multiple}
      defaultValue={defaultValue}
      aria-label={ariaLabel}
      className={className ?? 'form-input'}
    >
      {placeholder && !multiple && <option value="">{placeholder}</option>}
      {groups
        ? groups.map((g) => (
            <optgroup key={g.label} label={g.label} disabled={g.disabled}>
              {g.options.map((opt) => (
                <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                  {opt.label}
                </option>
              ))}
            </optgroup>
          ))
        : options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
    </select>
  )
})

export default ChoiceSelect
