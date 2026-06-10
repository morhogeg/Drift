// Hebrew + Arabic (incl. presentation forms) \u2014 the RTL scripts Drift renders.
const RTL_REGEX = /[\u0590-\u05FF\uFB1D-\uFB4F\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/

export const detectRTL = (text: string): boolean => RTL_REGEX.test(text)

/** @deprecated kept for back-compat \u2014 now matches any RTL script, not only Hebrew. */
export const detectHebrew = detectRTL

export const getTextDirection = (text: string): 'rtl' | 'ltr' => {
  return detectRTL(text) ? 'rtl' : 'ltr'
}

export const getRTLClassName = (text: string): string => {
  return detectRTL(text) ? 'text-right dir-rtl' : ''
}

// For truncated spans: rely on the `dir="rtl"` attribute for alignment instead
// of forcing `text-right`. Forcing `text-right` together with Tailwind's
// `truncate` makes the ellipsis land on the wrong side and clip the meaningful
// start of an RTL phrase.
export const getRTLTruncateClassName = (text: string): string => {
  return detectHebrew(text) ? 'dir-rtl' : ''
}