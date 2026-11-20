/** Fork-brand copy: the eight shipped languages, registered under the `forkBrand` namespace. */

export const en = {
  'title': 'DSLRH',
} as const

/** The forkBrand locale namespace key union. */
export type ForkBrandKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The sidebar name-plate copy. */
    'forkBrand': ForkBrandKey
  }
}

/** Chinese strings (same keys as {@link en}); the brand title is language-independent. */
export const zh: Record<ForkBrandKey, string> = {
  'title': 'DSLRH',
}

/** Japanese strings, checked against the English keys; the brand title is language-independent. */
export const ja = {
  'title': 'DSLRH',
} satisfies Record<ForkBrandKey, string>

/** Spanish strings, checked against the English keys; the brand title is language-independent. */
export const es = {
  'title': 'DSLRH',
} satisfies Record<ForkBrandKey, string>

/** French strings, checked against the English keys; the brand title is language-independent. */
export const fr = {
  'title': 'DSLRH',
} satisfies Record<ForkBrandKey, string>

/** German strings, checked against the English keys; the brand title is language-independent. */
export const de = {
  'title': 'DSLRH',
} satisfies Record<ForkBrandKey, string>

/** Russian strings, checked against the English keys; the brand title is language-independent. */
export const ru = {
  'title': 'DSLRH',
} satisfies Record<ForkBrandKey, string>

/** Portuguese strings, checked against the English keys; the brand title is language-independent. */
export const pt = {
  'title': 'DSLRH',
} satisfies Record<ForkBrandKey, string>
