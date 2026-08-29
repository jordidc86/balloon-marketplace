import assert from 'node:assert/strict'
import test from 'node:test'
import { isOptionalSupabaseSchemaError } from '../src/utils/audit-schema-compatibility.mjs'

test('production audit recognizes only missing release-candidate schema as optional', () => {
  assert.equal(isOptionalSupabaseSchemaError({ code: 'PGRST205', message: 'table missing from schema cache' }), true)
  assert.equal(isOptionalSupabaseSchemaError({ code: 'PGRST204', message: 'column missing' }), true)
  assert.equal(isOptionalSupabaseSchemaError({ code: '42P01', message: 'undefined table' }), true)
  assert.equal(isOptionalSupabaseSchemaError({ code: '42501', message: 'permission denied' }), false)
  assert.equal(isOptionalSupabaseSchemaError({ code: 'PGRST301', message: 'JWT expired' }), false)
  assert.equal(isOptionalSupabaseSchemaError({ message: 'network timeout' }), false)
})
