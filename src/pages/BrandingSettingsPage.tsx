import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import { brandingApi, ApiError } from '../lib/api'
import { mediaUrl } from '../theme/branding'
import { Button, Card, DataState, PageHeader, useToast } from '../components/ui'

const DEFAULTS = { primaryColor: '#2f4fb4', secondaryColor: '#1f8470', textPrimaryColor: '#1e2431', textSecondaryColor: '#64748b' }

export function BrandingSettingsPage() {
  const queryClient = useQueryClient()
  const { push } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const brandingQuery = useQuery({ queryKey: ['branding'], queryFn: brandingApi.get })

  const [primaryColor, setPrimaryColor] = useState(DEFAULTS.primaryColor)
  const [secondaryColor, setSecondaryColor] = useState(DEFAULTS.secondaryColor)
  const [textPrimaryColor, setTextPrimaryColor] = useState(DEFAULTS.textPrimaryColor)
  const [textSecondaryColor, setTextSecondaryColor] = useState(DEFAULTS.textSecondaryColor)

  useEffect(() => {
    if (!brandingQuery.data) return
    setPrimaryColor(brandingQuery.data.primaryColor || DEFAULTS.primaryColor)
    setSecondaryColor(brandingQuery.data.secondaryColor || DEFAULTS.secondaryColor)
    setTextPrimaryColor(brandingQuery.data.textPrimaryColor || DEFAULTS.textPrimaryColor)
    setTextSecondaryColor(brandingQuery.data.textSecondaryColor || DEFAULTS.textSecondaryColor)
  }, [brandingQuery.data])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['branding'] })

  const save = useMutation({
    mutationFn: () => brandingApi.update({ primaryColor, secondaryColor, textPrimaryColor, textSecondaryColor }),
    onSuccess: () => {
      push('Branding saved', 'success')
      invalidate()
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to save branding', 'error'),
  })

  const uploadLogo = useMutation({
    mutationFn: (file: File) => brandingApi.uploadLogo(file),
    onSuccess: () => {
      push('Logo uploaded', 'success')
      invalidate()
    },
    onError: (err) => push(err instanceof ApiError ? err.message : 'Failed to upload logo', 'error'),
  })

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadLogo.mutate(file)
    e.target.value = ''
  }

  const logoSrc = mediaUrl(brandingQuery.data?.logoUrl)

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title="Branding" subtitle="Customize the client panel's logo and colors for your organization." />

      <DataState isLoading={brandingQuery.isLoading} error={brandingQuery.error} onRetry={() => brandingQuery.refetch()}>
        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <div className="mb-3 text-sm font-bold text-slate-800">Logo</div>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                {logoSrc ? <img src={logoSrc} alt="Organization logo" className="h-full w-full object-contain" /> : <span className="text-xs text-muted">No logo</span>}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
              <Button variant="outline" leftIcon={<Upload size={16} />} onClick={() => fileInputRef.current?.click()} loading={uploadLogo.isPending}>
                Upload Logo
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-3 text-sm font-bold text-slate-800">Colors</div>
            <div className="grid grid-cols-2 gap-4">
              <ColorField label="Primary (buttons, links)" value={primaryColor} onChange={setPrimaryColor} />
              <ColorField label="Secondary (accents)" value={secondaryColor} onChange={setSecondaryColor} />
              <ColorField label="Heading Text" value={textPrimaryColor} onChange={setTextPrimaryColor} />
              <ColorField label="Muted Text" value={textSecondaryColor} onChange={setTextSecondaryColor} />
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={() => save.mutate()} loading={save.isPending}>
                Save Branding
              </Button>
            </div>
          </Card>
        </div>
      </DataState>
    </div>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>
      <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-2 py-1.5 shadow-sm">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0" />
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="w-full border-0 bg-transparent text-sm outline-none" />
      </div>
    </div>
  )
}
