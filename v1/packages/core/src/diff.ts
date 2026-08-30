import type { DiffLine } from '../../domain/src/types.ts'

/**
 * A deterministic line diff for article-sized Markdown documents.
 * Uses an LCS matrix for normal-sized inputs and falls back to a coarse block
 * diff when the cartesian product would be excessive.
 */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split('\n')
  const b = newText.split('\n')

  if (a.length * b.length > 1_000_000)
    return coarseDiff(a, b)

  const cols = b.length + 1
  const matrix = new Uint32Array((a.length + 1) * cols)
  const at = (i: number, j: number) => i * cols + j

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      matrix[at(i, j)] = a[i] === b[j]
        ? matrix[at(i + 1, j + 1)] + 1
        : Math.max(matrix[at(i + 1, j)], matrix[at(i, j + 1)])
    }
  }

  const result: DiffLine[] = []
  let i = 0
  let j = 0
  let oldLine = 1
  let newLine = 1

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      result.push({ type: 'same', text: a[i]!, oldLine, newLine })
      i++
      j++
      oldLine++
      newLine++
      continue
    }

    if (matrix[at(i + 1, j)] >= matrix[at(i, j + 1)]) {
      result.push({ type: 'remove', text: a[i]!, oldLine, newLine: null })
      i++
      oldLine++
    }
    else {
      result.push({ type: 'add', text: b[j]!, oldLine: null, newLine })
      j++
      newLine++
    }
  }

  while (i < a.length) {
    result.push({ type: 'remove', text: a[i]!, oldLine, newLine: null })
    i++
    oldLine++
  }
  while (j < b.length) {
    result.push({ type: 'add', text: b[j]!, oldLine: null, newLine })
    j++
    newLine++
  }
  return result
}

function coarseDiff(a: string[], b: string[]): DiffLine[] {
  let prefix = 0
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix])
    prefix++

  let suffix = 0
  while (
    suffix < a.length - prefix
    && suffix < b.length - prefix
    && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) suffix++

  const result: DiffLine[] = []
  for (let i = 0; i < prefix; i++)
    result.push({ type: 'same', text: a[i]!, oldLine: i + 1, newLine: i + 1 })

  for (let i = prefix; i < a.length - suffix; i++)
    result.push({ type: 'remove', text: a[i]!, oldLine: i + 1, newLine: null })

  for (let j = prefix; j < b.length - suffix; j++)
    result.push({ type: 'add', text: b[j]!, oldLine: null, newLine: j + 1 })

  for (let s = suffix; s > 0; s--) {
    const ai = a.length - s
    const bj = b.length - s
    result.push({ type: 'same', text: a[ai]!, oldLine: ai + 1, newLine: bj + 1 })
  }
  return result
}
