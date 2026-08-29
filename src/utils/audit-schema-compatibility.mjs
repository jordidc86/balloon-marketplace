const optionalSchemaCodes = new Set(['PGRST204', 'PGRST205', '42P01', '42703'])

export function isOptionalSupabaseSchemaError(error) {
  const code = String(error?.code || '').trim().toUpperCase()
  if (optionalSchemaCodes.has(code)) return true
  const message = String(error?.message || '').toLowerCase()
  return message.includes('could not find') && message.includes('schema cache')
}
