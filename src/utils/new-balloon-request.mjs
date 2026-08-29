import crypto from 'node:crypto'
import { getCatalogCategory } from './catalog-categories.mjs'
import { normalizeNewBalloonLeadSource } from './new-balloon-lead.mjs'

const allowedManufacturers = ['advice', 'pasha', 'schroeder']
const allowedEquipmentTypes = ['complete-balloon', 'envelope-only', 'basket', 'burner', 'bottom-end', 'cylinder', 'other-equipment']
const allowedUses = ['private', 'commercial-rides', 'advertising', 'competition', 'training']
const allowedBudgets = ['not-specified', 'under-50k', '50k-100k', '100k-150k', '150k-plus']
const allowedTimelines = ['exploring', '0-3-months', '3-6-months', '6-12-months']
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const unsafeDemandPattern = /(?:https?:\/\/|www\.|[^\s@]+@[^\s@]+\.[^\s@]+|(?:\+?\d[\d\s().-]{6,}\d))/i

const text = (formData, key, max) => {
  const raw = formData.get(key)
  return typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ').slice(0, max) : ''
}

const multiline = (formData, key, max) => {
  const raw = formData.get(key)
  return typeof raw === 'string' ? raw.trim().replace(/\r\n/g, '\n').slice(0, max) : ''
}

const oneOf = (value, allowed, fallback) => allowed.includes(value) ? value : fallback

const safeDemandText = (value, max = 160) => {
  if (typeof value !== 'string') return ''
  const bounded = value.trim().replace(/\s+/g, ' ').slice(0, max)
  if (!bounded || unsafeDemandPattern.test(bounded)) return ''
  return bounded.replace(/[^\p{L}\p{N}\s+.,/'()&-]/gu, ' ').replace(/\s+/g, ' ').trim()
}

export const normalizeNewBalloonDemandContext = (input = {}) => {
  const category = getCatalogCategory(input.category)
  return {
    requested_category: category?.slug || null,
    requested_equipment: safeDemandText(input.query),
    requested_country: safeDemandText(input.country, 80),
  }
}

export const equipmentTypeForCategory = (category) => ({
  complete: 'complete-balloon',
  envelopes: 'envelope-only',
  baskets: 'basket',
  burners: 'burner',
  'bottom-end': 'bottom-end',
  cylinders: 'cylinder',
  'other-equipment': 'other-equipment',
}[category] || '')

export const parseNewBalloonQuoteRequest = (formData) => {
  if (text(formData, 'company_website', 200)) throw new Error('Unable to submit this request.')

  const name = text(formData, 'name', 120)
  const email = text(formData, 'email', 320).toLowerCase()
  const equipmentType = oneOf(text(formData, 'equipment_type', 40), allowedEquipmentTypes, '')
  if (name.length < 2) throw new Error('Please enter your name.')
  if (!emailPattern.test(email)) throw new Error('Please enter a valid email address.')
  if (!equipmentType) throw new Error('Please select the equipment you need.')
  if (formData.get('privacy_consent') !== 'on') throw new Error('Please confirm that AeroTrade may respond to this request.')

  const demand = normalizeNewBalloonDemandContext({
    category: text(formData, 'requested_category', 40),
    query: text(formData, 'requested_equipment', 200),
    country: text(formData, 'requested_country', 100),
  })

  return {
    name,
    email,
    phone: text(formData, 'phone', 50) || null,
    country: text(formData, 'country', 80) || null,
    manufacturer_preference: oneOf(text(formData, 'manufacturer_preference', 30), allowedManufacturers, 'advice'),
    equipment_type: equipmentType,
    volume_or_capacity: text(formData, 'volume_or_capacity', 120) || null,
    intended_use: oneOf(text(formData, 'intended_use', 40), allowedUses, 'private'),
    budget_range: oneOf(text(formData, 'budget_range', 30), allowedBudgets, 'not-specified'),
    timeline: oneOf(text(formData, 'timeline', 30), allowedTimelines, 'exploring'),
    colors_or_branding: multiline(formData, 'colors_or_branding', 1000) || null,
    notes: multiline(formData, 'notes', 2000) || null,
    source_context: normalizeNewBalloonLeadSource(text(formData, 'source_context', 40)),
    ...demand,
  }
}

export const newBalloonQuoteSubmissionKey = (address, userAgent, secret) => {
  if (!secret || typeof secret !== 'string') return null
  const principal = `${String(address || '').trim()}|${String(userAgent || '').slice(0, 300)}`
  if (principal === '|') return null
  return crypto.createHmac('sha256', secret).update(principal).digest('hex')
}
