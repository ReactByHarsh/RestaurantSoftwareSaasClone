import { describe, expect, it } from 'vitest'
import { buildImageSearchQueries, imageSearchRelevance, pickCommonsImage } from './menuItemImages'

describe('menu item image lookup', () => {
  it('accepts close Commons matches', () => {
    expect(pickCommonsImage([
      { title: 'File:Aloo Paratha (96238).jpg', imageinfo: [{ thumburl: 'https://images.example/aloo.jpg', mime: 'image/jpeg' }] },
    ], 'Aloo Paratha')).toBe('https://images.example/aloo.jpg')

    expect(pickCommonsImage([
      { title: 'File:100 Pipers bottle.jpg', imageinfo: [{ thumburl: 'https://images.example/pipers.jpg', mime: 'image/jpeg' }] },
    ], '100 Pipers 60')).toBe('https://images.example/pipers.jpg')
  })

  it('rejects unrelated results for unknown or abbreviated names', () => {
    expect(pickCommonsImage([
      { title: 'File:Dylan Walsh on The Talk (cropped).jpg', imageinfo: [{ thumburl: 'https://images.example/person.jpg', mime: 'image/jpeg' }] },
    ], 'B 10 Nip')).toBeNull()

    expect(pickCommonsImage([
      { title: 'File:Laughter Chefs title card.jpg', imageinfo: [{ thumburl: 'https://images.example/show.jpg', mime: 'image/jpeg' }] },
    ], 'Anda Thali')).toBeNull()
  })

  it('ignores non-image files and blocked titles', () => {
    expect(pickCommonsImage([
      { title: 'File:Tea logo.png', imageinfo: [{ thumburl: 'https://images.example/logo.png', mime: 'image/png' }] },
    ], 'Tea')).toBeNull()

    expect(pickCommonsImage([
      { title: 'File:Tea chart.svg', imageinfo: [{ thumburl: 'https://images.example/chart.svg', mime: 'image/svg+xml' }] },
    ], 'Tea')).toBeNull()
  })

  it('scores title relevance against the product name', () => {
    expect(imageSearchRelevance('File:Cold Coffee 2.jpg', 'Cold Coffee')).toBe(1)
    expect(imageSearchRelevance('File:Dylan Walsh.jpg', 'B 10 Nip')).toBe(0)
  })

  it('builds cleaner search queries for pack sizes', () => {
    expect(buildImageSearchQueries('Antiquity Nip')).toContain('Antiquity')
    expect(buildImageSearchQueries('100 Pipers 90 ml')).toContain('100 Pipers')
    expect(buildImageSearchQueries('Chicken 65')[0]).toBe('Chicken 65')
  })
})
