// Downscale a photo data URL before embedding it in a PDF. A full-resolution
// delivery photo bloats the signed invoice to several MB, which iOS Messages
// refuses to send ("Cannot Send Message"). ~1400px JPEG @ 0.6 keeps it legible
// at a few hundred KB. Client-side only (uses <img> + canvas).
export function downscaleDataUrl(
  dataUrl: string,
  maxEdge = 1400,
  quality = 0.6,
): Promise<string> {
  return new Promise((resolve) => {
    try {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
        // Already small enough — leave it be
        if (scale >= 1 && !dataUrl.startsWith('data:image/png')) { resolve(dataUrl); return }
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) { resolve(dataUrl); return }
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = () => resolve(dataUrl) // fall back to original on any error
      img.src = dataUrl
    } catch {
      resolve(dataUrl)
    }
  })
}
