import type maplibregl from 'maplibre-gl'
import { jsPDF } from 'jspdf'

export interface PrintLegendEntry {
  id: string
  name: string
  color: string
  geometryType: 'Point' | 'LineString' | 'Polygon'
}

export interface PrintComposeOptions {
  title: string
  subtitle?: string | null
  legend: PrintLegendEntry[]
  orgName?: string | null
  orgLogoUrl?: string | null
}

const PADDING = 28
const HEADER_HEIGHT = 78
const LEGEND_ITEM_HEIGHT = 22
const LEGEND_WIDTH = 240
const LEGEND_MAX_ITEMS = 14

/**
 * Reveal the hidden GL-only point layer, wait for the map to finish
 * painting, snapshot the canvas, then hide the layer again. Point assets
 * normally render as maplibregl.Marker DOM elements (see MapDashboardPage's
 * point-markers effect) — invisible to canvas.toDataURL() — so
 * 'assets-points-capture' (added alongside the other assets-* layers) is
 * what actually makes points show up in exported imagery.
 */
export async function captureMapImage(map: maplibregl.Map): Promise<HTMLCanvasElement> {
  const hasCaptureLayer = !!map.getLayer('assets-points-capture')
  if (hasCaptureLayer) map.setLayoutProperty('assets-points-capture', 'visibility', 'visible')
  await new Promise<void>((resolve) => map.once('idle', () => resolve()))

  const source = map.getCanvas()
  // Copy immediately — toggling the layer back off triggers a repaint that
  // would otherwise race whatever the caller does next with this canvas.
  const snapshot = document.createElement('canvas')
  snapshot.width = source.width
  snapshot.height = source.height
  const ctx = snapshot.getContext('2d')
  if (!ctx) throw new Error('Could not create a 2D canvas context')
  ctx.drawImage(source, 0, 0)

  if (hasCaptureLayer) map.setLayoutProperty('assets-points-capture', 'visibility', 'none')
  return snapshot
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

// "Nice" round imperial distances to choose a scale-bar length from —
// mirrors the units (feet/miles) MapDashboardPage's own formatDistance() and
// the on-map ScaleControl (configured with unit: 'imperial') already use.
const NICE_FEET_STEPS = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10560, 26400, 52800, 105600, 264000, 528000]

function drawScaleBar(ctx: CanvasRenderingContext2D, map: maplibregl.Map, x: number, bottomY: number, dpr: number) {
  const center = map.getCenter()
  const zoom = map.getZoom()
  const metersPerPxCss = (156543.03392 * Math.cos((center.lat * Math.PI) / 180)) / Math.pow(2, zoom)
  const feetPerPxCss = metersPerPxCss * 3.28084

  const targetCssPx = 110
  let feet = NICE_FEET_STEPS[0]
  for (const step of NICE_FEET_STEPS) {
    if (step / feetPerPxCss <= targetCssPx * 1.5) feet = step
  }
  const widthPx = (feet / feetPerPxCss) * dpr
  const label = feet < 5280 ? `${feet.toLocaleString()} ft` : `${(feet / 5280).toFixed(feet % 5280 ? 1 : 0)} mi`

  const y = bottomY
  ctx.save()
  ctx.strokeStyle = '#0f172a'
  ctx.fillStyle = '#0f172a'
  ctx.lineWidth = 2 * dpr
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + widthPx, y)
  ctx.moveTo(x, y - 5 * dpr)
  ctx.lineTo(x, y + 5 * dpr)
  ctx.moveTo(x + widthPx, y - 5 * dpr)
  ctx.lineTo(x + widthPx, y + 5 * dpr)
  ctx.stroke()
  ctx.font = `${12 * dpr}px sans-serif`
  ctx.textBaseline = 'bottom'
  ctx.fillText(label, x, y - 8 * dpr)
  ctx.restore()
}

function drawLegend(ctx: CanvasRenderingContext2D, entries: PrintLegendEntry[], x: number, y: number, dpr: number) {
  const shown = entries.slice(0, LEGEND_MAX_ITEMS)
  const itemH = LEGEND_ITEM_HEIGHT * dpr
  const boxW = LEGEND_WIDTH * dpr
  const boxH = (shown.length + (entries.length > LEGEND_MAX_ITEMS ? 1 : 0)) * itemH + 16 * dpr

  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.strokeStyle = 'rgba(15,23,42,0.15)'
  ctx.lineWidth = 1 * dpr
  ctx.beginPath()
  ctx.rect(x, y, boxW, boxH)
  ctx.fill()
  ctx.stroke()

  ctx.textBaseline = 'middle'
  shown.forEach((entry, i) => {
    const rowY = y + 8 * dpr + i * itemH + itemH / 2
    const swatchX = x + 12 * dpr
    ctx.fillStyle = entry.color
    ctx.strokeStyle = entry.color
    if (entry.geometryType === 'Point') {
      ctx.beginPath()
      ctx.arc(swatchX + 5 * dpr, rowY, 5 * dpr, 0, Math.PI * 2)
      ctx.fill()
    } else if (entry.geometryType === 'LineString') {
      ctx.lineWidth = 3 * dpr
      ctx.beginPath()
      ctx.moveTo(swatchX, rowY)
      ctx.lineTo(swatchX + 10 * dpr, rowY)
      ctx.stroke()
    } else {
      ctx.fillRect(swatchX, rowY - 5 * dpr, 10 * dpr, 10 * dpr)
    }
    ctx.fillStyle = '#0f172a'
    ctx.font = `${12 * dpr}px sans-serif`
    ctx.fillText(entry.name, swatchX + 20 * dpr, rowY)
  })
  if (entries.length > LEGEND_MAX_ITEMS) {
    ctx.fillStyle = '#64748b'
    ctx.font = `${11 * dpr}px sans-serif`
    ctx.fillText(`+ ${entries.length - LEGEND_MAX_ITEMS} more`, x + 12 * dpr, y + 8 * dpr + shown.length * itemH + itemH / 2)
  }
  ctx.restore()
}

/**
 * Compose the captured map image with a title block, legend, and scale bar
 * onto a new canvas. Throws if the map canvas turned out to be CORS-tainted
 * (e.g. the tile source didn't send permissive CORS headers) — callers
 * should surface that as a clear error rather than a silent blank export.
 */
export async function composeExportCanvas(mapCanvas: HTMLCanvasElement, map: maplibregl.Map, opts: PrintComposeOptions): Promise<HTMLCanvasElement> {
  const dpr = window.devicePixelRatio || 1
  const canvas = document.createElement('canvas')
  canvas.width = mapCanvas.width
  canvas.height = mapCanvas.height + HEADER_HEIGHT * dpr
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create a 2D canvas context')

  // Title block
  ctx.fillStyle = '#0b2545'
  ctx.fillRect(0, 0, canvas.width, HEADER_HEIGHT * dpr)

  let textX = PADDING * dpr
  if (opts.orgLogoUrl) {
    const logo = await loadImage(opts.orgLogoUrl)
    if (logo) {
      const logoH = 40 * dpr
      const logoW = (logo.width / logo.height) * logoH
      try {
        ctx.drawImage(logo, PADDING * dpr, (HEADER_HEIGHT * dpr - logoH) / 2, logoW, logoH)
        textX = PADDING * dpr + logoW + 16 * dpr
      } catch {
        // A CORS-restricted logo image would taint this canvas — skip it
        // rather than losing the whole export over a decorative logo.
      }
    }
  }

  ctx.fillStyle = '#ffffff'
  ctx.font = `${16 * dpr}px sans-serif`
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(opts.title, textX, 32 * dpr)
  ctx.font = `${12 * dpr}px sans-serif`
  ctx.fillStyle = '#c7d2e0'
  const subtitleParts = [opts.subtitle, opts.orgName, new Date().toLocaleDateString()].filter(Boolean)
  ctx.fillText(subtitleParts.join('  ·  '), textX, 52 * dpr)

  // Map image
  ctx.drawImage(mapCanvas, 0, HEADER_HEIGHT * dpr)

  // Scale bar (bottom-left of the map area)
  drawScaleBar(ctx, map, PADDING * dpr, canvas.height - PADDING * dpr, dpr)

  // Legend (bottom-right of the map area)
  if (opts.legend.length) {
    const legendW = LEGEND_WIDTH * dpr
    drawLegend(ctx, opts.legend, canvas.width - legendW - PADDING * dpr, canvas.height - PADDING * dpr - 200 * dpr, dpr)
  }

  // This is where a tainted source surfaces — getImageData/toDataURL/toBlob
  // throw a SecurityError once *anything* CORS-restricted has been drawn in.
  try {
    ctx.getImageData(0, 0, 1, 1)
  } catch {
    throw new Error('Map imagery could not be exported — the tile source did not allow cross-origin image reads.')
  }

  return canvas
}

export function exportCanvasToPNG(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename.endsWith('.png') ? filename : `${filename}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, 'image/png')
}

export function exportCanvasToPDF(canvas: HTMLCanvasElement, filename: string) {
  const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait'
  const doc = new jsPDF({ orientation, unit: 'px', format: [canvas.width, canvas.height] })
  doc.addImage(canvas, 'PNG', 0, 0, canvas.width, canvas.height)
  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
}
