import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 512,
          height: 512,
          background: '#dc2626',
          borderRadius: 112,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            color: '#ffffff',
            fontSize: 300,
            fontWeight: 900,
            lineHeight: 1,
            fontFamily: 'sans-serif',
            marginTop: 20,
          }}
        >
          S
        </span>
      </div>
    ),
    { width: 512, height: 512 }
  )
}
