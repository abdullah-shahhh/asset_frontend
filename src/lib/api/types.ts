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

/** Freeform label — organizations name their own survey types, it isn't a fixed set. */
export type ProjectSurveyType = string

export interface Project {
  id: string
  name: string
  description: string | null
  status: 'active' | 'completed' | 'archived'
  surveyType: ProjectSurveyType
  templateFields: AssetTypeField[]
  photosRequired: boolean
  createdAt: string
  updatedAt: string
}

export type GeometryType = 'Point' | 'LineString' | 'Polygon'

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

/** Manager-defined named drawing tool (point/line/polygon) with a color. Field
 * surveys may only draw with symbologies assigned to their active project. */
export interface Symbology {
  id: string
  name: string
  key: string
  geometryType: GeometryType
  color: string
  /** Icon key from the curated picker (Point symbologies only) — the client's choice. */
  icon: string | null
  /** A custom-uploaded icon image — takes precedence over `icon` when set. */
  iconUrl: string | null
  /** Does this symbology represent real equipment that can be online/offline? Org-defined, Point-only. */
  isEquipment: boolean
  createdAt: string
  updatedAt: string
}

export type AssetStatus = 'pending' | 'approved' | 'rejected'
export type OperationalStatus = 'online' | 'degraded' | 'offline' | 'maintenance'

export interface GeoJsonGeometry {
  type: GeometryType
  coordinates: number[] | number[][] | number[][][]
}

export interface NetworkAssetProperties {
  id: string
  projectId: string
  project: { id: string; name: string } | null
  symbologyId: string | null
  symbology: { id: string; name: string; key: string; color: string; icon: string | null; iconUrl: string | null; isEquipment: boolean } | null
  color: string | null
  icon: string | null
  iconUrl: string | null
  assetType: string
  geometryType: GeometryType
  attributes: Record<string, unknown>
  status: AssetStatus
  operationalStatus: OperationalStatus | null
  ipAddress: string | null
  createdByUserId: string | null
  createdBy: { id: string; name: string; email: string } | null
  reviewedByUserId: string | null
  reviewedAt: string | null
  rejectionReason: string | null
  media: { id: string; url: string; mimeType: string | null; sizeBytes: number | null; createdAt: string }[]
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
