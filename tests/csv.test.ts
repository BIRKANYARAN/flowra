import { describe, it, expect } from 'vitest'
import { parseCsv, detectDelimiter, mapHeaders, gridToObjects } from '@/lib/csv'

describe('csv parser', () => {
  it('detects comma / semicolon / tab delimiters', () => {
    expect(detectDelimiter('a,b,c')).toBe(',')
    expect(detectDelimiter('a;b;c')).toBe(';')
    expect(detectDelimiter('a\tb\tc')).toBe('\t')
  })

  it('parses semicolon-delimited Turkish-Excel CSV with a BOM', () => {
    const grid = parseCsv('﻿Ad;E-posta\nABC A.Ş.;info@abc.com')
    expect(grid).toEqual([['Ad', 'E-posta'], ['ABC A.Ş.', 'info@abc.com']])
  })

  it('respects quoted fields with embedded delimiters, quotes and newlines', () => {
    const grid = parseCsv('name,note\n"Acme, Inc.","say ""hi""\nline2"')
    expect(grid).toEqual([['name', 'note'], ['Acme, Inc.', 'say "hi"\nline2']])
  })

  it('drops blank lines and CRLF', () => {
    const grid = parseCsv('a,b\r\n\r\n1,2\r\n')
    expect(grid).toEqual([['a', 'b'], ['1', '2']])
  })

  it('maps Turkish + English headers to canonical fields', () => {
    const syn = { 'ad': 'name', 'e-posta': 'email', 'telefon': 'phone', 'vergi no': 'tax_number' }
    expect(mapHeaders(['Ad', 'E-Posta', 'Bilinmeyen', 'Vergi No'], syn))
      .toEqual(['name', 'email', null, 'tax_number'])
  })

  it('gridToObjects keys rows by canonical field and skips unknown/empty cells', () => {
    const syn = { 'ad': 'name', 'telefon': 'phone' }
    const grid = [['Ad', 'Telefon', 'Extra'], ['ABC', '', 'x'], ['XYZ', '555']]
    const { fields, rows } = gridToObjects(grid, syn)
    expect(fields).toEqual(['name', 'phone'])
    expect(rows).toEqual([{ name: 'ABC' }, { name: 'XYZ', phone: '555' }])
  })
})
