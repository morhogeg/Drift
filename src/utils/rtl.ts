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