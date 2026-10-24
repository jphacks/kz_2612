import { Navigate, Route, Routes } from 'react-router-dom'
import { LoginPage } from './pages/LoginPage'
import { CreateFolderPage, FolderListPage } from './pages/FolderPages'
import {
  CameraPage,
  CameraPermissionPage,
  ResultPage,
  UnlockPage,
  VerifyingPage,
} from './pages/AuthPages'
import {
  FolderSettingsPage,
  GalleryPage,
  PhotoDetailPage,
  UploadPage,
} from './pages/GalleryPages'
import { NotFoundPage } from './pages/NotFoundPage'
import { InviteAcceptPage, InviteMembersPage } from './pages/InvitePages'
import {
  AuthCallbackPage,
  RequireAccount,
} from './pages/AuthAccountPages'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/invite/:token" element={<InviteAcceptPage />} />
      <Route element={<RequireAccount />}>
        <Route path="/folders" element={<FolderListPage />} />
        <Route path="/folders/new" element={<CreateFolderPage />} />
        <Route
          path="/folders/:folderId/invite-members"
          element={<InviteMembersPage />}
        />
        <Route path="/folders/:folderId/unlock" element={<UnlockPage />} />
        <Route
          path="/folders/:folderId/camera-permission"
          element={<CameraPermissionPage />}
        />
        <Route path="/folders/:folderId/camera" element={<CameraPage />} />
        <Route path="/folders/:folderId/verifying" element={<VerifyingPage />} />
        <Route path="/folders/:folderId/auth-result" element={<ResultPage />} />
        <Route path="/folders/:folderId/photos" element={<GalleryPage />} />
        <Route
          path="/folders/:folderId/photos/:photoId"
          element={<PhotoDetailPage />}
        />
        <Route path="/folders/:folderId/upload" element={<UploadPage />} />
        <Route
          path="/folders/:folderId/settings"
          element={<FolderSettingsPage />}
        />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
