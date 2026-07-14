import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { brandingApi } from '../lib/api'
import { applyBranding } from './branding'

/**
 * Fetch the organization's branding and apply it (colors, logo) to the panel.
 * Re-applies whenever the branding query is invalidated (e.g. after Branding
 * settings saves), so changes take effect immediately without a reload.
 * Returns the branding so the shell/sidebar can show the logo.
 */
export function useApplyBranding() {
  const { data } = useQuery({
    queryKey: ['branding'],
    queryFn: brandingApi.get,
    staleTime: 5 * 60_000,
  })

  useEffect(() => {
    if (data) applyBranding(data)
  }, [data])

  return data
}
