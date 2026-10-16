import { describe, expect, it } from 'vitest'
import { dictionaries, translateText } from './index'

describe('page translations', () => {
  it('keeps page coverage aligned across supported languages', () => {
    expect(Object.keys(dictionaries.en).length).toBe(Object.keys(dictionaries.hi).length)
    expect(Object.keys(dictionaries.en).length).toBe(Object.keys(dictionaries.mr).length)
  })

  it('translates operational labels and long helper copy', () => {
    expect(translateText('Create one or many tables inside a section', 'hi')).toBe('सेक्शन के अंदर एक या कई टेबल बनाएँ')
    expect(translateText('All printer setup, print size controls, and live previews in one place', 'mr')).toBe('सर्व प्रिंटर सेटअप, प्रिंट आकार नियंत्रण आणि लाईव्ह प्रीव्ह्यू एकाच ठिकाणी')
    expect(translateText('Recorded separately; not added to this bill.', 'hi')).toBe('अलग से दर्ज; इस बिल में शामिल नहीं।')
    expect(translateText('CHECKOUT', 'mr')).toBe('चेकआउट')
    expect(translateText('Show UPI QR on bill', 'hi')).toBe('बिल पर UPI QR दिखाएँ')
  })
})
