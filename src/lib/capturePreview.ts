/**
 * 解除のときに撮った写真を、開封の演出で「今日」として見せるためだけに覚えておく。
 * サーバーには残さない方針なので、このタブのメモリにだけ置く（再読み込みで消える）。
 */
const captures = new Map<string, string>()

export function rememberCapture(folderId: string, image: Blob) {
  const previous = captures.get(folderId)
  if (previous) URL.revokeObjectURL(previous)
  captures.set(folderId, URL.createObjectURL(image))
}

export function getRememberedCapture(folderId: string | undefined) {
  return folderId ? captures.get(folderId) : undefined
}
