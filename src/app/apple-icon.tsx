import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: '#dc2626',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            color: '#ffffff',
            fontSize: 110,
            fontWeight: 900,
            lineHeight: 1,
            fontFamily: 'sans-serif',
            marginTop: 8,
          }}
        >
          S
        </span>
      </div>
    ),
    { width: 180, height: 180 }
  )
}
