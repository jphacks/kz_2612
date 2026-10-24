export type FolderStatus = 'locked' | 'open'
export type PhotoTone = 'sunset' | 'ocean' | 'forest' | 'violet' | 'peach' | 'sky'

export interface FolderSummary {
  id: string
  name: string
  memberCount: number
  photoCount: number
  status: FolderStatus
  updatedAt: string
  accent: PhotoTone
}

export interface StoredPhoto {
  id: string
  folderId: string
  capturedAt: string
  tone: PhotoTone
  label: string
}

export interface Member {
  email: string
  name: string
  initials: string
}
