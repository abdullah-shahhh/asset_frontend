/**
 * Organization branding applied to the panel at runtime.
 *
 * Tailwind v4 utilities (bg-primary-600, etc.) reference CSS custom
 * properties (--color-primary-*), so overriding those variables on :root
 * re-themes the whole panel live. We derive a full 50–900 scale from the
 * organization's single primary/secondary hex with tinycolor2, and resolve
 * the logo URL (served from the backend's /uploads folder).
 */
import tinycolor from 'tinycolor2'

export interface Branding {
  primaryColor?: string | null
  secondaryColor?: string | null
  textPrimaryColor?: string | null
  textSecondaryColor?: string | null
  logoUrl?: string | null
}

const DEFAULT_PRIMARY = '#2f4fb4'
const DEFAULT_SECONDARY = '#1f8470'
const DEFAULT_INK = '#1e2431'
const DEFAULT_MUTED = '#64748b'

/** Backend origin (API base minus the /api path) — where /uploads is served. */
function backendOrigin(): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:5000/api'
  return base.replace(/\/api(\/v\d+)?\/?$/, '').replace(/\/$/, '')
}

/** Resolve a backend-stored media path (e.g. "/uploads/x.png") to a full URL. */
export function mediaUrl(path?: string | null): string | null {
  if (!path) return null
  if (/^(https?:\/\/|data:)/i.test(path)) return path
  return `${backendOrigin()}${path.startsWith('/') ? '' : '/'}${path}`
}

/** Build a 50–900 scale from a base hex, anchored so 600 = the chosen color. */
function buildScale(baseHex: string): Record<string, string> {
  const base = tinycolor(baseHex)
  return {
    '50': tinycolor.mix(base, '#ffffff', 92).toHexString(),
    '100': tinycolor.mix(base, '#ffffff', 84).toHexString(),
    '200': tinycolor.mix(base, '#ffffff', 68).toHexString(),
    '300': tinycolor.mix(base, '#ffffff', 48).toHexString(),
    '400': tinycolor.mix(base, '#ffffff', 24).toHexString(),
    '500': tinycolor.mix(base, '#ffffff', 8).toHexString(),
    '600': base.toHexString(),
    '700': tinycolor.mix(base, '#000000', 16).toHexString(),
    '800': tinycolor.mix(base, '#000000', 30).toHexString(),
    '900': tinycolor.mix(base, '#000000', 44).toHexString(),
  }
}

/** Apply branding to the document. Pass null/undefined to reset to defaults. */
export function applyBranding(b: Branding | null | undefined) {
  const root = document.documentElement

  const primary = b?.primaryColor && tinycolor(b.primaryColor).isValid() ? b.primaryColor : DEFAULT_PRIMARY
  Object.entries(buildScale(primary)).forEach(([shade, hex]) => root.style.setProperty(`--color-primary-${shade}`, hex))

  const secondary = b?.secondaryColor && tinycolor(b.secondaryColor).isValid() ? b.secondaryColor : DEFAULT_SECONDARY
  root.style.setProperty('--brand-secondary', secondary)

  const ink = b?.textPrimaryColor && tinycolor(b.textPrimaryColor).isValid() ? b.textPrimaryColor : DEFAULT_INK
  const muted = b?.textSecondaryColor && tinycolor(b.textSecondaryColor).isValid() ? b.textSecondaryColor : DEFAULT_MUTED
  root.style.setProperty('--color-ink', ink)
  root.style.setProperty('--color-muted', muted)
}
