import { readFile } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'

/** Serve icon.svg directly — avoids redirect to 0.0.0.0 when app is opened via Docker HOSTNAME. */
export async function GET() {
  try {
    const svg = await readFile(path.join(process.cwd(), 'public', 'icon.svg'))
    return new NextResponse(svg, {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' },
    })
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}
