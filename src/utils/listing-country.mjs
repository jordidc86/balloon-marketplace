const countryAliases = new Map([
  ['belgium', 'Belgium'],
  ['belgique', 'Belgium'],
  ['belgie', 'Belgium'],
  ['czech republic', 'Czech Republic'],
  ['czechia', 'Czech Republic'],
  ['prague, czech republic', 'Czech Republic'],
  ['espana', 'Spain'],
  ['españa', 'Spain'],
  ['spain', 'Spain'],
  ['turkey', 'Türkiye'],
  ['turkiye', 'Türkiye'],
  ['türkiye', 'Türkiye'],
])

export function normalizeListingCountry(value) {
  const trimmed = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (!trimmed) return ''

  return countryAliases.get(trimmed.toLocaleLowerCase('en-US')) || trimmed
}
