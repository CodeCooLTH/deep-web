import { describe, it, expect } from 'vitest'
import * as v from 'valibot'
import { PasswordSchema, ShopSlugSchema, ShopCategorySchema, SetPasswordSchema } from './validations'

describe('auth validations', () => {
  it('PasswordSchema enforces strength', () => {
    expect(v.safeParse(PasswordSchema, 'Abcd123!').success).toBe(true)
    expect(v.safeParse(PasswordSchema, 'weak').success).toBe(false)
  })
  it('ShopSlugSchema enforces format', () => {
    expect(v.safeParse(ShopSlugSchema, 'my-shop').success).toBe(true)
    expect(v.safeParse(ShopSlugSchema, 'ab').success).toBe(false)
    expect(v.safeParse(ShopSlugSchema, 'Admin').success).toBe(false)
  })
  it('ShopCategorySchema is a picklist', () => {
    expect(v.safeParse(ShopCategorySchema, 'fashion').success).toBe(true)
    expect(v.safeParse(ShopCategorySchema, 'nope').success).toBe(false)
  })
  it('SetPasswordSchema validates phone+otp+password', () => {
    expect(v.safeParse(SetPasswordSchema, { phone: '0812345678', otp: '123456', password: 'Abcd123!' }).success).toBe(true)
    expect(v.safeParse(SetPasswordSchema, { phone: 'x', otp: '12', password: 'weak' }).success).toBe(false)
  })
})
