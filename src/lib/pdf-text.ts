/**
 * Measuring text before it is printed, and never cutting a word in half.
 *
 * Two things live here, and they exist because of one label. On 2026-09-01 the
 * shipping labels for transport 20260901 came out with the customer's name
 * printed as "Canarbo Epicu-" on one line and "rian Market" on the next. Her
 * words: "de naam van de klant kan je niet halverwege afbreken... zorg ervoor
 * dat dit nooit gebeurt".
 *
 * 1. `Font.registerHyphenationCallback` below switches the hyphenator off for
 *    every PDF this app makes. react-pdf hyphenates a word that does not fit;
 *    on a document with people's names and street names on it, that is always
 *    wrong.
 *
 * 2. Switching it off is only half the fix — a word that still does not fit
 *    would simply be chopped without the dash. So `fitFontSize` works out the
 *    largest size at which the text actually fits the space it has, and the
 *    document asks for that size instead of a fixed one.
 *
 * The widths are Adobe's own for the standard Helvetica that react-pdf ships
 * with, in units of 1/1000 em, which is what makes the measurement exact rather
 * than a guess.
 */
import { Font } from '@react-pdf/renderer'

// prettier-ignore
const HELVETICA: Record<string, number> = {
  ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556,
  '8': 556, '9': 556, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556,
  '@': 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  '{': 334, '|': 260, '}': 334, '~': 584,
}

// prettier-ignore
const HELVETICA_BOLD: Record<string, number> = {
  ' ': 278, '!': 333, '"': 474, '#': 556, $: 556, '%': 889, '&': 722, "'": 238,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556,
  '8': 556, '9': 556, ':': 333, ';': 333, '<': 584, '=': 584, '>': 584, '?': 611,
  '@': 975,
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556,
  K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '[': 333, '\\': 278, ']': 333, '^': 584, _: 556, '`': 333,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278,
  k: 556, l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333,
  u: 611, v: 556, w: 778, x: 556, y: 556, z: 500,
  '{': 389, '|': 280, '}': 389, '~': 584,
}

export type PdfFont = 'Helvetica' | 'Helvetica-Bold'

/**
 * Width of a piece of text in points.
 *
 * Accented letters — the ç of Curaçao, the é of a French label — are not in the
 * table above; they are drawn from the same design and sit within a point of
 * their unaccented twin, so that is what they are measured as. Anything else
 * falls back to the width of a lowercase o, which is mid-range: it can be a
 * fraction out, never wildly.
 */
export function textWidth(text: string, fontSize: number, font: PdfFont = 'Helvetica'): number {
  const table = font === 'Helvetica-Bold' ? HELVETICA_BOLD : HELVETICA
  let units = 0
  for (const ch of text) {
    const plain = ch.normalize('NFD')[0]
    units += table[ch] ?? table[plain] ?? table.o
  }
  return (units * fontSize) / 1000
}

/**
 * Break text into lines the way react-pdf does with the hyphenator off: at
 * spaces only, greedily, and never inside a word.
 */
export function wrapLines(text: string, maxWidth: number, fontSize: number, font: PdfFont = 'Helvetica'): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const lines: string[] = []
  let line = words[0]
  for (const word of words.slice(1)) {
    const candidate = `${line} ${word}`
    if (textWidth(candidate, fontSize, font) <= maxWidth) line = candidate
    else { lines.push(line); line = word }
  }
  lines.push(line)
  return lines
}

/**
 * The largest size, walking down from `max` in steps of a quarter point, at
 * which `text` fits `maxWidth` in no more than `maxLines` lines with every word
 * left whole.
 *
 * Returns `min` when even that is not enough — one very long word on a narrow
 * label can be impossible, and a name shrunk past legibility is worse than a
 * name that runs a little wide. That case is bounded by the caller's floor, on
 * purpose, rather than by silently chopping the word.
 */
export function fitFontSize(
  text: string,
  maxWidth: number,
  max: number,
  min: number,
  maxLines = 1,
  font: PdfFont = 'Helvetica',
): number {
  if (!text.trim()) return max
  for (let size = max; size >= min; size -= 0.25) {
    const lines = wrapLines(text, maxWidth, size, font)
    const longestWordFits = text.split(/\s+/).every(w => textWidth(w, size, font) <= maxWidth)
    if (lines.length <= maxLines && longestWordFits) return size
  }
  return min
}

/**
 * The size at which `text` fits `maxWidth` on ONE line, never more — her
 * instruction of 2026-09-15: "zet de hele naam op 1 regel". Never larger than
 * `max`, and with no floor, because the line is what is fixed here and the size
 * is what gives.
 */
export function fitOneLine(text: string, maxWidth: number, max: number, font: PdfFont = 'Helvetica'): number {
  const width = textWidth(text.trim(), 1, font)
  if (!width) return max
  return Math.min(max, Math.floor((maxWidth / width) * 4) / 4)
}

/**
 * No hyphens, anywhere, in any document this app prints. Handing the word back
 * as a single piece is how react-pdf is told it cannot be split.
 *
 * This runs on import, so a PDF only has to import something from this file to
 * be covered. Every document component does.
 */
Font.registerHyphenationCallback((word: string) => [word])
