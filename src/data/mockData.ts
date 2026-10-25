import type { FolderSummary, Member, StoredPhoto } from '../types/domain'

export const folders: FolderSummary[] = [
  {
    id: 'summer-2026',
    name: '夏合宿 2026',
    memberCount: 4,
    photoCount: 12,
    status: 'locked',
    updatedAt: '2日前',
    accent: 'sunset',
  },
  {
    id: 'after-school',
    name: '放課後メモリーズ',
    memberCount: 3,
    photoCount: 8,
    status: 'open',
    updatedAt: '5時間前',
    accent: 'violet',
  },
]

export const members: Member[] = [
  { email: 'you@example.com', name: 'あなた', initials: 'YO' },
  { email: 'haru@example.com', name: 'はる', initials: 'HA' },
  { email: 'mio@example.com', name: 'みお', initials: 'MI' },
  { email: 'sora@example.com', name: 'そら', initials: 'SO' },
]

export const photos: StoredPhoto[] = [
  { id: 'p1', folderId: 'summer-2026', capturedAt: '2026.08.18', tone: 'sunset', label: '夕暮れの海' },
  { id: 'p2', folderId: 'summer-2026', capturedAt: '2026.08.18', tone: 'ocean', label: '海辺の集合写真' },
  { id: 'p3', folderId: 'summer-2026', capturedAt: '2026.08.17', tone: 'forest', label: '森の散歩道' },
  { id: 'p4', folderId: 'summer-2026', capturedAt: '2026.08.17', tone: 'peach', label: '朝焼け' },
  { id: 'p5', folderId: 'summer-2026', capturedAt: '2026.08.16', tone: 'violet', label: '夜の花火' },
  { id: 'p6', folderId: 'summer-2026', capturedAt: '2026.08.16', tone: 'sky', label: '青空ジャンプ' },
]

export function getFolder(folderId?: string) {
  return folders.find((folder) => folder.id === folderId) ?? folders[0]
}
