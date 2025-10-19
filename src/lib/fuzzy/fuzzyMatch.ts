// Lightweight string similarity utils (no deps)

// Jaro–Winkler similarity (0..1)
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1
  const s1 = a.toLowerCase()
  const s2 = b.toLowerCase()
  const m = Math.floor(Math.max(s1.length, s2.length) / 2) - 1
  if (m < 0) return 0

  const s1Matches: boolean[] = new Array(s1.length).fill(false)
  const s2Matches: boolean[] = new Array(s2.length).fill(false)

  let matches = 0
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - m)
    const end = Math.min(i + m + 1, s2.length)
    for (let j = start; j < end; j++) {
      if (s2Matches[j]) continue
      if (s1[i] !== s2[j]) continue
      s1Matches[i] = true
      s2Matches[j] = true
      matches++
      break
    }
  }
  if (matches === 0) return 0

  let t = 0
  let k = 0
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue
    while (!s2Matches[k]) k++
    if (s1[i] !== s2[k]) t++
    k++
  }

  const jaro = (matches / s1.length + matches / s2.length + (matches - t / 2) / matches) / 3
  // Winkler prefix boost
  let l = 0
  while (l < 4 && l < s1.length && l < s2.length && s1[l] === s2[l]) l++
  return jaro + l * 0.1 * (1 - jaro)
}

export function ngramCosine(a: string, b: string, n = 3): number {
  const grams = (s: string) => {
    const arr: Record<string, number> = {}
    const t = ` ${s.toLowerCase()} `
    for (let i = 0; i <= t.length - n; i++) {
      const g = t.slice(i, i + n)
      arr[g] = (arr[g] || 0) + 1
    }
    return arr
  }
  const A = grams(a)
  const B = grams(b)
  const keys = new Set([...Object.keys(A), ...Object.keys(B)])
  let dot = 0, na = 0, nb = 0
  keys.forEach(k => {
    const va = A[k] || 0
    const vb = B[k] || 0
    dot += va * vb
    na += va * va
    nb += vb * vb
  })
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export function fuzzySimilar(a: string, b: string): number {
  // Blend to reduce brittleness
  return 0.6 * jaroWinkler(a, b) + 0.4 * ngramCosine(a, b, 3)
}

