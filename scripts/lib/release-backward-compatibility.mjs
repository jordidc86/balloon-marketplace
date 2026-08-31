import assert from 'node:assert/strict'

const quotePattern = /'((?:''|[^'])*)'/g

const normalizeSql = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()

export function extractConstraintVocabulary(sql, constraintName, columnName) {
  const normalizedName = String(constraintName || '').trim()
  const normalizedColumn = String(columnName || '').trim()
  assert.match(normalizedName, /^[a-z0-9_]+$/, 'Constraint name is invalid')
  assert.match(normalizedColumn, /^[a-z0-9_]+$/, 'Constraint column is invalid')

  const start = sql.lastIndexOf(`add constraint ${normalizedName}`)
  assert.ok(start >= 0, `Constraint ${normalizedName} was not found`)
  const end = sql.indexOf(';', start)
  assert.ok(end > start, `Constraint ${normalizedName} has no terminating statement`)
  const segment = sql.slice(start, end)
  const vocabularyMatch = new RegExp(`check\\s*\\(\\s*${normalizedColumn}\\s+in\\s*\\(([\\s\\S]*?)\\)\\s*\\)`, 'i').exec(segment)
  assert.ok(vocabularyMatch, `Constraint ${normalizedName} does not expose one closed ${normalizedColumn} vocabulary`)

  const values = [...vocabularyMatch[1].matchAll(quotePattern)].map((match) => match[1].replaceAll("''", "'"))
  assert.ok(values.length > 0, `Constraint ${normalizedName} vocabulary is empty`)
  assert.equal(new Set(values).size, values.length, `Constraint ${normalizedName} vocabulary contains duplicates`)
  return Object.freeze(values)
}

export function assertVocabularyExpansion({ name, baseValues, candidateValues }) {
  const missing = baseValues.filter((value) => !candidateValues.includes(value))
  assert.deepEqual(missing, [], `${name} removes values accepted by the deployed application`)
  return Object.freeze({
    name,
    baseValueCount: baseValues.length,
    candidateValueCount: candidateValues.length,
    addedValues: Object.freeze(candidateValues.filter((value) => !baseValues.includes(value))),
  })
}

export function extractFunctionContract(sql, functionName) {
  const normalizedName = String(functionName || '').trim()
  assert.match(normalizedName, /^[a-z0-9_]+$/, 'Function name is invalid')
  const definitions = [...sql.matchAll(new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${normalizedName}\\s*\\(([\\s\\S]*?)\\)\\s*returns\\s+table\\s*\\(([\\s\\S]*?)\\)\\s*language\\s+([a-z0-9_]+)\\s+security\\s+definer\\s+set\\s+search_path\\s*=\\s*([^\\n]+)`,
    'gi',
  ))]
  assert.ok(definitions.length > 0, `Function ${normalizedName} was not found`)
  const match = definitions.at(-1)
  const signature = normalizeSql(match[1])
  const returns = normalizeSql(match[2])
  const language = normalizeSql(match[3])
  const searchPath = normalizeSql(match[4])
  const revoke = normalizeSql(sql).includes(`revoke all on function public.${normalizedName}(${signature.replaceAll(' default null', '').replaceAll(/p_[a-z0-9_]+ /g, '')}) from public, anon, authenticated`)
  const grant = normalizeSql(sql).includes(`grant execute on function public.${normalizedName}(`)
    && normalizeSql(sql).includes(') to service_role')
  return Object.freeze({ signature, returns, language, searchPath, securityDefiner: true, revokePublicAnonAuthenticated: revoke, grantServiceRole: grant })
}

export function assertStableFunctionContract({ name, baseContract, candidateContract }) {
  assert.equal(candidateContract.signature, baseContract.signature, `${name} changes its argument contract`)
  assert.equal(candidateContract.returns, baseContract.returns, `${name} changes its return contract`)
  assert.equal(candidateContract.language, baseContract.language, `${name} changes its language contract`)
  assert.equal(candidateContract.searchPath, baseContract.searchPath, `${name} changes its search path`)
  assert.equal(candidateContract.securityDefiner, true, `${name} must remain security definer`)
  assert.equal(candidateContract.revokePublicAnonAuthenticated, true, `${name} must remain revoked from public clients`)
  assert.equal(candidateContract.grantServiceRole, true, `${name} must remain executable by service role`)
  return Object.freeze({ name, stable: true })
}

export function assertNoHardDestructiveDdl(migrations) {
  const forbidden = [
    /\bdrop\s+table\b/i,
    /\bdrop\s+column\b/i,
    /\brename\s+(?:table|column)\b/i,
    /\balter\s+column\b[\s\S]{0,120}\btype\b/i,
    /\btruncate\b/i,
  ]
  for (const migration of migrations) {
    for (const pattern of forbidden) {
      assert.doesNotMatch(migration.sql, pattern, `${migration.path} contains hard destructive DDL`)
    }
  }
  return Object.freeze({ migrationsChecked: migrations.length, hardDestructiveOperations: 0 })
}

export function validateLiveVocabulary({ name, observedValues, allowedValues }) {
  const unexpectedValues = observedValues.filter((entry) => !allowedValues.includes(entry.value))
  assert.deepEqual(unexpectedValues, [], `${name} contains live values rejected by the candidate constraint`)
  return Object.freeze({
    name,
    rowCount: observedValues.reduce((total, entry) => total + entry.count, 0),
    distinctValueCount: observedValues.length,
    unexpectedValueCount: 0,
  })
}

export function assertSellerFunnelCompatibility(sql, baseStages) {
  const normalized = normalizeSql(sql)
  const preListingStages = ['SELL_PAGE_VIEWED', 'FORM_STARTED']
  for (const stage of preListingStages.filter((stage) => baseStages.includes(stage))) {
    assert.ok(normalized.includes(`'${stage.toLowerCase()}'`), `Seller funnel no longer accepts ${stage}`)
  }
  for (const stage of baseStages.filter((stage) => !preListingStages.includes(stage))) {
    assert.ok(normalized.includes(`'${stage.toLowerCase()}'`), `Seller funnel no longer accepts ${stage}`)
  }
  assert.match(normalized, /stage <> 'listing_shared' and channel is null/, 'Old seller events must retain a null channel default')
  assert.doesNotMatch(normalized.slice(0, normalized.indexOf('alter table public.seller_funnel_events', 1)), /channel\s+text\s+not\s+null/, 'The new seller channel must be nullable for the deployed application')
  return Object.freeze({ baseStageCount: baseStages.length, oldEventsUseNullChannel: true })
}
