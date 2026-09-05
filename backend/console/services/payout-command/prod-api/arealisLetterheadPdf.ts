/**
 * Arealis letterhead PDF builder.
 * Uses public/images/logo/zord-mark-exact-black.svg for the brand mark.
 */

import fs from 'fs'
import path from 'path'
import { deflateSync } from 'zlib'
import sharp from 'sharp'

const PAGE_W = 595
const PAGE_H = 842
const MARGIN_X = 48
const RIGHT_EDGE = PAGE_W - MARGIN_X
const CONTENT_TOP_FIRST = 580
const CONTENT_TOP_NEXT = 770
const LINE_GAP = 14
const LINES_PER_FIRST = 34
const LINES_PER_NEXT = 46

/**
 * Display size of the Zord mark in PDF points.
 * Sized to match the Arealis letterhead (mark ~2.5-3× the wordmark height).
 */
const LOGO_W = 40
const LOGO_H = 42
const LOGO_CONT_W = 28
const LOGO_CONT_H = 30
const BRAND_SIZE = 13
const BRAND_CONT_SIZE = 11

/** Terracotta accent ~ #C1877E */
const RULE_R = 0.757
const RULE_G = 0.529
const RULE_B = 0.494

const LOGO_SVG_PATH = path.join(
  process.cwd(),
  'public/images/logo/zord-mark-exact-black.svg',
)

export type LetterheadMeta = {
  date: string
  to: string
  subject: string
  title: string
}

export type LetterheadSection = {
  heading?: string
  lines: string[]
}

type LogoRaster = {
  width: number
  height: number
  rgb: Buffer
}

let logoCache: LogoRaster | null | undefined

async function loadZordLogo(): Promise<LogoRaster | null> {
  if (logoCache !== undefined) return logoCache
  try {
    if (!fs.existsSync(LOGO_SVG_PATH)) {
      logoCache = null
      return null
    }
    const svg = fs.readFileSync(LOGO_SVG_PATH)
    const width = 128
    const height = Math.round(width * (280 / 265))
    const { data, info } = await sharp(svg)
      .resize(width, height, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    if (info.channels !== 3) {
      logoCache = null
      return null
    }
    logoCache = { width: info.width, height: info.height, rgb: data }
    return logoCache
  } catch {
    logoCache = null
    return null
  }
}

function escapePdfText(value: string): string {
  const ascii = value
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2022/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '?')
  return ascii.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

/** Approximate Helvetica glyph width (ASCII-biased). */
function textWidth(text: string, fontSize: number): number {
  let w = 0
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    if (ch === ' ') w += 0.28
    else if (ch === 'i' || ch === 'l' || ch === 'I' || ch === 'j' || ch === 't' || ch === 'f') w += 0.3
    else if (ch === 'm' || ch === 'w' || ch === 'M' || ch === 'W') w += 0.85
    else if (code >= 65 && code <= 90) w += 0.7
    else if (code >= 48 && code <= 57) w += 0.55
    else w += 0.55
  }
  return w * fontSize
}

function drawText(
  x: number,
  y: number,
  text: string,
  opts: { font?: 'F1' | 'F2'; size?: number; gray?: number } = {},
): string {
  const font = opts.font ?? 'F1'
  const size = opts.size ?? 10
  const gray = opts.gray
  const colorOp = gray != null ? `${gray.toFixed(3)} g\n` : '0 g\n'
  return `${colorOp}BT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(text)}) Tj ET\n`
}

function drawRightText(
  rightX: number,
  y: number,
  text: string,
  opts: { font?: 'F1' | 'F2'; size?: number; gray?: number } = {},
): string {
  const size = opts.size ?? 9
  const x = rightX - textWidth(text, size)
  return drawText(Math.max(MARGIN_X, x), y, text, opts)
}

/** Fallback geometric mark if the public SVG cannot be loaded. */
function drawLogoMarkFallback(x: number, y: number): string {
  const s = 11
  return [
    '0 g',
    '1.15 w',
    `${x} ${y} m`,
    `${x + s} ${y + s * 1.55} l`,
    `${x + s * 2} ${y} l`,
    'S',
    '0.9 w',
    `${x + 4} ${y + 2} m`,
    `${x + s} ${y + s * 1.05} l`,
    `${x + s * 2 - 4} ${y + 2} l`,
    'S',
    '',
  ].join('\n')
}

function drawLogoImage(x: number, y: number, w = LOGO_W, h = LOGO_H): string {
  return `q\n${w} 0 0 ${h} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/Im1 Do\nQ\n`
}

function placeLogo(
  x: number,
  y: number,
  hasLogo: boolean,
  size: { w: number; h: number } = { w: LOGO_W, h: LOGO_H },
): string {
  return hasLogo ? drawLogoImage(x, y, size.w, size.h) : drawLogoMarkFallback(x, y)
}

function letterheadStream(meta: LetterheadMeta, hasLogo: boolean): string {
  // Logo top sits near the page edge; wordmark is vertically centered on the mark.
  const logoBottom = 788
  const logoCenterY = logoBottom + LOGO_H / 2
  const brandBaseline = logoCenterY - BRAND_SIZE * 0.35
  let s = ''

  s += placeLogo(MARGIN_X, logoBottom, hasLogo)
  const textX = MARGIN_X + (hasLogo ? LOGO_W + 10 : 28)
  s += drawText(textX, brandBaseline, 'AREALIS', { font: 'F1', size: BRAND_SIZE })
  s += drawText(textX + textWidth('AREALIS ', BRAND_SIZE), brandBaseline, 'ZORD', {
    font: 'F2',
    size: BRAND_SIZE,
  })

  const companyTop = 828
  s += drawRightText(RIGHT_EDGE, companyTop, 'AREALIS NETWORKS PRIVATE LIMITED', {
    font: 'F2',
    size: 9,
  })
  s += drawRightText(RIGHT_EDGE, companyTop - 13, 'Adarsh Colony, Sayyad Nagar, S. No. 74, Lane 28', {
    font: 'F1',
    size: 8.5,
    gray: 0.25,
  })
  s += drawRightText(RIGHT_EDGE, companyTop - 25, 'Hadapsar, Pune - 411028, Maharashtra', {
    font: 'F1',
    size: 8.5,
    gray: 0.25,
  })
  s += drawRightText(RIGHT_EDGE, companyTop - 37, 'networks@arealis.io | arealis.io', {
    font: 'F1',
    size: 8.5,
    gray: 0.2,
  })

  const ruleY = 768
  s += `${RULE_R} ${RULE_G} ${RULE_B} RG\n`
  s += '0.8 w\n'
  s += `${MARGIN_X} ${ruleY} m ${RIGHT_EDGE} ${ruleY} l S\n`
  s += '0 G\n'

  let y = ruleY - 28
  s += drawText(MARGIN_X, y, meta.date, { font: 'F1', size: 10, gray: 0.35 })
  y -= 22
  s += drawText(MARGIN_X, y, 'To:', { font: 'F2', size: 10 })
  s += drawText(MARGIN_X + textWidth('To: ', 10), y, meta.to, { font: 'F1', size: 10 })
  y -= 16
  s += drawText(MARGIN_X, y, 'Subject:', { font: 'F2', size: 10 })
  s += drawText(MARGIN_X + textWidth('Subject: ', 10), y, meta.subject, {
    font: 'F1',
    size: 10,
  })
  y -= 30

  const titleLines = wrapLine(meta.title, 68)
  for (const line of titleLines.slice(0, 2)) {
    s += drawText(MARGIN_X, y, line, { font: 'F2', size: 17 })
    y -= 22
  }

  return s
}

function wrapLine(text: string, maxChars: number): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxChars) return [clean]
  const words = clean.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word
    if (next.length > maxChars && cur) {
      lines.push(cur)
      cur = word
    } else {
      cur = next
    }
  }
  if (cur) lines.push(cur)
  return lines
}

function flattenSections(sections: LetterheadSection[]): string[] {
  const out: string[] = []
  for (const section of sections) {
    if (section.heading) {
      if (out.length) out.push('')
      out.push(section.heading)
    }
    for (const line of section.lines) {
      out.push(...wrapLine(line, 92))
    }
  }
  return out
}

function bodyStream(lines: string[], startY: number): string {
  let s = '0 g\nBT\n/F1 10 Tf\n'
  s += `${MARGIN_X} ${startY} Td\n`
  lines.forEach((line, idx) => {
    if (idx > 0) s += `0 -${LINE_GAP} Td\n`
    const looksLikeHeading =
      line.length > 0 &&
      line.length < 48 &&
      !line.includes(':') &&
      /^[A-Z0-9][A-Z0-9 \-/&()]+$/.test(line)

    if (looksLikeHeading) {
      s += `/F2 10 Tf\n(${escapePdfText(line)}) Tj\n/F1 10 Tf\n`
    } else {
      s += `(${escapePdfText(line)}) Tj\n`
    }
  })
  s += 'ET\n'
  return s
}

function continuationHeader(hasLogo: boolean): string {
  const logoBottom = 800
  const brandBaseline = logoBottom + LOGO_CONT_H / 2 - BRAND_CONT_SIZE * 0.35
  let s = placeLogo(MARGIN_X, logoBottom, hasLogo, { w: LOGO_CONT_W, h: LOGO_CONT_H })
  const textX = MARGIN_X + (hasLogo ? LOGO_CONT_W + 8 : 28)
  s += drawText(textX, brandBaseline, 'AREALIS', { font: 'F1', size: BRAND_CONT_SIZE })
  s += drawText(textX + textWidth('AREALIS ', BRAND_CONT_SIZE), brandBaseline, 'ZORD', {
    font: 'F2',
    size: BRAND_CONT_SIZE,
  })
  s += `${RULE_R} ${RULE_G} ${RULE_B} RG\n0.6 w\n`
  s += `${MARGIN_X} 788 m ${RIGHT_EDGE} 788 l S\n0 G\n`
  return s
}

function imageObjectBody(logo: LogoRaster): Buffer {
  const compressed = deflateSync(logo.rgb)
  const header = Buffer.from(
    `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`,
    'utf8',
  )
  const footer = Buffer.from('\nendstream', 'utf8')
  return Buffer.concat([header, compressed, footer])
}

function buildPdf(pageStreams: string[], logo: LogoRaster | null): Uint8Array {
  const N = pageStreams.length
  const hasLogo = Boolean(logo)
  const imageObjNum = hasLogo ? 5 : 0
  const firstPageObj = hasLogo ? 6 : 5
  const pageObjNums = Array.from({ length: N }, (_, i) => firstPageObj + 2 * i)
  const streamObjNums = Array.from({ length: N }, (_, i) => firstPageObj + 1 + 2 * i)
  const kidsRef = pageObjNums.map((n) => `${n} 0 R`).join(' ')

  const xObjectRes = hasLogo ? ` /XObject << /Im1 ${imageObjNum} 0 R >>` : ''
  const pageResources = `/Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xObjectRes} >>`

  const objects: Buffer[] = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'utf8'),
    Buffer.from(`<< /Type /Pages /Kids [${kidsRef}] /Count ${N} >>`, 'utf8'),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', 'utf8'),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>', 'utf8'),
  ]

  if (logo) {
    objects.push(imageObjectBody(logo))
  }

  for (let i = 0; i < N; i++) {
    objects.push(
      Buffer.from(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ${pageResources} /Contents ${streamObjNums[i]} 0 R >>`,
        'utf8',
      ),
    )
    const streamBytes = Buffer.from(pageStreams[i], 'utf8')
    objects.push(
      Buffer.concat([
        Buffer.from(`<< /Length ${streamBytes.length} >>\nstream\n`, 'utf8'),
        streamBytes,
        Buffer.from('\nendstream', 'utf8'),
      ]),
    )
  }

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n', 'utf8')]
  const offsets: number[] = [0]
  let offset = chunks[0].length

  objects.forEach((obj, idx) => {
    offsets.push(offset)
    const header = Buffer.from(`${idx + 1} 0 obj\n`, 'utf8')
    const footer = Buffer.from('\nendobj\n', 'utf8')
    chunks.push(header, obj, footer)
    offset += header.length + obj.length + footer.length
  })

  const xrefOffset = offset
  let xref = `xref\n0 ${objects.length + 1}\n`
  xref += '0000000000 65535 f \n'
  offsets.slice(1).forEach((off) => {
    xref += `${String(off).padStart(10, '0')} 00000 n \n`
  })
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  chunks.push(Buffer.from(xref, 'utf8'))

  return new Uint8Array(Buffer.concat(chunks))
}

export async function buildArealisLetterheadPdf(
  meta: LetterheadMeta,
  sections: LetterheadSection[],
): Promise<Uint8Array> {
  const logo = await loadZordLogo()
  const hasLogo = Boolean(logo)
  const bodyLines = flattenSections(sections)
  const pages: string[][] = []

  if (bodyLines.length === 0) {
    pages.push([])
  } else {
    pages.push(bodyLines.slice(0, LINES_PER_FIRST))
    let lineOffset = LINES_PER_FIRST
    while (lineOffset < bodyLines.length) {
      pages.push(bodyLines.slice(lineOffset, lineOffset + LINES_PER_NEXT))
      lineOffset += LINES_PER_NEXT
    }
  }

  const streams = pages.map((chunk, pageIndex) => {
    if (pageIndex === 0) {
      return letterheadStream(meta, hasLogo) + bodyStream(chunk, CONTENT_TOP_FIRST)
    }
    return continuationHeader(hasLogo) + bodyStream(chunk, CONTENT_TOP_NEXT)
  })

  return buildPdf(streams, logo)
}

export function formatPdfDate(isoOrDate?: string | null): string {
  const d = isoOrDate ? new Date(isoOrDate) : new Date()
  if (Number.isNaN(d.getTime())) {
    return new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function fieldLine(label: string, value: unknown): string {
  const text = value == null || value === '' ? '-' : String(value)
  return `${label}:  ${text}`
}
