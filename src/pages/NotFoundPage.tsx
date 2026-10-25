import { FolderSearch } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { Button, EmptyState } from '../components/Ui'

export function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <AppShell>
      <div className="screen screen--center">
        <EmptyState
          icon={<FolderSearch size={30} />}
          title="ページが見つかりません"
          description="URLが変わったか、フォルダが削除された可能性があります。"
          action={<Button onClick={() => navigate('/folders')}>フォルダ一覧へ</Button>}
        />
      </div>
    </AppShell>
  )
}
