export interface DevelopmentIdentity {
  userId: string
  email: string
}

const STORAGE_KEY = 'web-time-capsule:development-identity'
const defaultUserId = import.meta.env.VITE_DEMO_USER_ID || 'demo-user'
export const defaultDevelopmentEmail =
  import.meta.env.VITE_DEMO_USER_EMAIL || 'demo@example.com'

export function getDevelopmentIdentity(): DevelopmentIdentity {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<DevelopmentIdentity>
      if (parsed.userId && parsed.email) {
        return { userId: parsed.userId, email: parsed.email }
      }
    }
  } catch {
    // 保存値を読めない環境では、ビルド時のデモアカウントを使う。
  }

  return { userId: defaultUserId, email: defaultDevelopmentEmail }
}

export function setDevelopmentIdentity(email: string): DevelopmentIdentity {
  const normalizedEmail = email.trim().toLowerCase()
  const identity = {
    userId:
      normalizedEmail === defaultDevelopmentEmail.toLowerCase()
        ? defaultUserId
        : 'dev:' + normalizedEmail,
    email: normalizedEmail,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity))
  return identity
}

export function clearDevelopmentIdentity() {
  localStorage.removeItem(STORAGE_KEY)
}
