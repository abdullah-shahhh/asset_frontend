export interface Role {
  id: string
  name: string
  slug: string
  description: string | null
  isSystem: boolean
  isSuperAdmin: boolean
  isActive: boolean
  permissions?: { id: string; key: string; group: string; label: string | null }[]
}

export interface OrgUser {
  id: string
  roleId: string
  firstName: string
  lastName: string | null
  email: string
  phone: string | null
  status: 'pending' | 'active' | 'suspended' | 'deleted'
  role?: { id: string; name: string; slug: string; isSuperAdmin: boolean }
  createdAt: string
}

export interface Project {
  id: string
  name: string
  description: string | null
  status: 'active' | 'completed' | 'archived'
  createdAt: string
  updatedAt: string
}

export type GeometryType = 'Point' | 'LineString'

export interface AssetTypeField {
  key: string
  label: string
  type: 'text' | 'number' | 'select' | 'boolean' | 'date' | 'textarea'
  required?: boolean
  options?: string[]
}

export interface AssetTypeDef {
  key: string
  label: string
  geometryType: GeometryType
  icon?: string
  color?: string
  fields: AssetTypeField[]
}

export interface SurveyTemplate {
  id: string
  moduleId: string
  name: string
  version: number
  isActive: boolean
  schemaJson: { assetTypes: AssetTypeDef[] }
  module?: { id: string; key: string; name: string }
}

export type AssetStatus = 'pending' | 'approved' | 'rejected'

export interface GeoJsonGeometry {
  type: GeometryType
  coordinates: number[] | number[][]
}

export interface NetworkAssetProperties {
  id: string
  projectId: string
  moduleId: string
  assetType: string
  geometryType: GeometryType
  attributes: Record<string, unknown>
  status: AssetStatus
  createdByUserId: string | null
  reviewedByUserId: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface NetworkAssetFeature {
  type: 'Feature'
  id: string
  geometry: GeoJsonGeometry
  properties: NetworkAssetProperties
}

export interface FeatureCollection {
  type: 'FeatureCollection'
  features: NetworkAssetFeature[]
}
