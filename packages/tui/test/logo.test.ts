import { expect, test } from "bun:test"
import { logo, marks } from "../src/logo"

test("wordmark halves each have 4 rows of consistent width", () => {
  expect(logo.left).toHaveLength(4)
  expect(logo.right).toHaveLength(4)
  for (const row of logo.left) expect(Array.from(row).length).toBe(Array.from(logo.left[0]).length)
  for (const row of logo.right) expect(Array.from(row).length).toBe(Array.from(logo.right[0]).length)
})

test("wordmark only uses supported glyph characters", () => {
  const allowed = new Set([..."█▀▄ ", ...marks])
  for (const row of [...logo.left, ...logo.right]) {
    for (const char of row) expect(allowed.has(char)).toBe(true)
  }
})

test("wordmark is the oa-cli brand, not opencode", () => {
  // opencode's halves were 19 columns each ("open"/"code"); oa-cli's are 12 ("oa-") and 9 ("cli")
  expect(Array.from(logo.left[1]).length).toBe(12)
  expect(Array.from(logo.right[1]).length).toBe(9)
})
