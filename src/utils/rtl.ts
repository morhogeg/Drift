export const detectHebrew = (text: string): boolean => {
  const hebrewRegex = /[\u0590-\u05FF\uFB1D-\uFB4F]/
  return hebrewRegex.test(text)
}

export const getTextDirection = (text: string): 'rtl' | 'ltr' => {
  return detectHebrew(text) ? 'rtl' : 'ltr'
}

export const getRTLClassName = (text: string): string => {
  return detectHebrew(text) ? 'text-right dir-rtl' : ''
}

// For truncated spans: rely on the `dir="rtl"` attribute for alignment instead
// of forcing `text-right`. Forcing `text-right` together with Tailwind's
// `truncate` makes the ellipsis land on the wrong side and clip the meaningful
// start of an RTL phrase.
export const getRTLTruncateClassName = (text: string): string => {
  return detectHebrew(text) ? 'dir-rtl' : ''
}