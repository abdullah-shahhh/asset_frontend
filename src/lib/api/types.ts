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

export interface ProjectStats {
  project: { id: string; name: string }
  totalAssets: number
  byType: { label: string; count: number }[]
  statusCounts: { pending: number; approved: number; rejected: number }
  surveyProgressPct: number
  damagedAssets: number
  assetsInMaintenance: number
  activeFaults: number
  totalOfcLengthFeet: number
  strands: { total: number; inService: number; utilizationPct: number }
  ports: { total: number; connected: number }
  activeSurveyors: number
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
  /** Does this symbology represent a fiber cable that carries strands? Org-defined, LineString-only. */
  isCable: boolean
  /** Does this symbology represent a radio transmitter whose coverage can be estimated? Org-defined, Point-only. */
  isRfSite: boolean
  /** Line rendering width in pixels. Only meaningful for LineString (and Polygon outline) symbologies. */
  lineWidth: number
  /** MapLibre line-dasharray, e.g. [4, 2] for dashed, [1, 2] for dotted, [] for solid. LineString-only. */
  dashArray: number[]
  /** Custom attribute schema for assets of this type. Takes precedence over the project's own templateFields when non-empty. */
  fields: AssetTypeField[]
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
  symbology: {
    id: string
    name: string
    key: string
    color: string
    icon: string | null
    iconUrl: string | null
    isEquipment: boolean
    isCable: boolean
    isRfSite: boolean
    lineWidth: number
    dashArray: number[]
    fields: AssetTypeField[]
  } | null
  color: string | null
  icon: string | null
  iconUrl: string | null
  lineWidth: number
  dashArray: number[]
  assetType: string
  geometryType: GeometryType
  attributes: Record<string, unknown>
  status: AssetStatus
  operationalStatus: OperationalStatus | null
  ipAddress: string | null
  createdByUserId: string | null
  createdBy: { id: string; name: string; email: string } | null
  reviewedByUserId: string | null
  reviewedBy: { id: string; name: string; email: string } | null
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

export type StrandStatus = 'available' | 'reserved' | 'in_service' | 'dark' | 'faulty' | 'under_test' | 'under_repair' | 'retired'
export type StrandRole = 'feeder' | 'distribution' | 'drop'
export type PortStatus = 'free' | 'connected'

export interface FiberStrand {
  id: string
  networkAssetId: string
  strandNumber: number
  tubeNumber: number
  color: string
  status: StrandStatus
  role: StrandRole | null
  assignedCustomerId: string | null
  assignedCustomer: { id: string; name: string; email: string | null; phone: string | null } | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface EquipmentPort {
  id: string
  networkAssetId: string
  portNumber: number
  status: PortStatus
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type SpliceEndpointType = 'strand' | 'port'

export interface SpliceEndpointRef {
  type: SpliceEndpointType
  strandId?: string
  side?: 'A' | 'Z'
  portId?: string
}

export interface FiberSplice {
  id: string
  projectId: string
  spliceAssetId: string | null
  endAType: SpliceEndpointType
  endAStrandId: string | null
  endAStrandSide: 'A' | 'Z' | null
  endAPortId: string | null
  endAStrand?: FiberStrand | null
  endAPort?: EquipmentPort | null
  endBType: SpliceEndpointType
  endBStrandId: string | null
  endBStrandSide: 'A' | 'Z' | null
  endBPortId: string | null
  endBStrand?: FiberStrand | null
  endBPort?: EquipmentPort | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface FiberTraceResult {
  strands: FiberStrand[]
  ports: EquipmentPort[]
  cableAssetIds: string[]
  customers: { id: string; name: string; email: string | null; phone: string | null }[]
}
