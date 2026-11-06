import { zahl } from '../spiel/Beamer.tsx'

describe('Zahlen beim Schieberegler', () => {
  it('Jahreszahlen und vierstellige Zahlen ohne Tausenderpunkt, ab fünf Stellen mit', () => {
    expect(zahl(1975)).toBe('1975')
    expect(zahl(9999)).toBe('9999')
    expect(zahl(-500)).toBe('-500')
    expect(zahl(10000)).toBe('10.000')
    expect(zahl(384400)).toBe('384.400')
    expect(zahl(2.5)).toBe('2,5')
    expect(zahl(1234.567)).toBe('1234,57')
  })
})
