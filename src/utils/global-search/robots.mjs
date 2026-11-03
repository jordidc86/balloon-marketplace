// Small, conservative robots reader. Unknown/malformed responses fail closed.
// Supports user-agent groups, longest-match Allow/Disallow, *, $ and crawl-delay.
export function robotsPolicy(text, url, agent = 'AeroTradeSearch') {
  const groups = []
  let group = null
  let hasRules = false
  for (const line of text.split(/\r?\n/)) {
    const match = line.replace(/#.*$/, '').trim().match(/^([a-z-]+)\s*:\s*(.*)$/i)
    if (!match) continue
    const [, rawKey, value] = match
    const key = rawKey.toLowerCase()
    if (key === 'user-agent') {
      if (!group || hasRules) { group = { agents: [], rules: [], delay: 0 }; groups.push(group); hasRules = false }
      group.agents.push(value.toLowerCase())
    } else if (group && ['allow', 'disallow', 'crawl-delay'].includes(key)) {
      hasRules = true
      if (key === 'crawl-delay') group.delay = Math.max(group.delay, Number(value) || 0)
      else if (value) group.rules.push({ allow: key === 'allow', path: value })
    }
  }
  if (!text.trim()) return { allowed: true, delay: 1 }
  if (!groups.length) return { allowed: false, delay: 1 }
  const named = groups.filter(g => g.agents.some(a => a !== '*' && agent.toLowerCase().includes(a)))
  const selected = named.length ? named : groups.filter(g => g.agents.includes('*'))
  const target = new URL(url).pathname + new URL(url).search
  const matches = selected.flatMap(g => g.rules).filter(rule => {
    const pattern = rule.path.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\$(?!$)/g, '\\$')
    return new RegExp('^' + pattern).test(target)
  }).sort((a, b) => b.path.replace(/[*$]/g, '').length - a.path.replace(/[*$]/g, '').length || Number(b.allow) - Number(a.allow))
  return { allowed: matches[0]?.allow ?? true, delay: Math.max(1, ...selected.map(g => g.delay)) }
}
