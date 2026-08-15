/**
 * The SPika lockup — the mark and the word, set the way the sign-in screen sets
 * them. Every screen uses this, so the treatment can never drift between them.
 *
 * All four numbers were measured against the real artwork on the sign-in screen
 * at a 96px mark, and they are expressed here as RATIOS of that height so the
 * lockup holds together at any size:
 *
 *   word size   = 1.00 x mark height   (96px word next to a 96px mark)
 *   pull-in     = 0.167 x              (16px at 96 — the file carries 33px of
 *                                       transparent margin on its right)
 *   drop        = 0.052 x              (5px at 96 — the glyphs sit 11px above
 *                                       the bottom of their own box, the mark
 *                                       carries 38px of empty margin under the
 *                                       drawing, and 11 - 6 = 5)
 *   strapline   = 0.025 x to the right (2.4px at 96 — centring on the box is
 *                                       not centring on the ink)
 *
 * Change the artwork and every one of these needs re-measuring.
 */

const WORD_RATIO = 1.0
const PULL_RATIO = 0.167
const DROP_RATIO = 0.052
const STRAP_RATIO = 0.025

export function BrandLockup({
  height = 32,
  word = 'SPika',
  strapline,
  className = '',
}: {
  /** Height of the mark in pixels. Everything else follows from it. */
  height?: number
  word?: string
  strapline?: string
  className?: string
}) {
  return (
    <div className={`flex flex-col items-center gap-0 ${className}`}>
      <div className="flex items-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- local brand asset, no loader needed */}
        <img
          src="/spika-s-red.png"
          alt="SPika"
          className="w-auto shrink-0"
          style={{ height }}
        />
        <span
          className="font-medium leading-none tracking-tighter whitespace-nowrap"
          style={{
            fontSize: height * WORD_RATIO,
            marginLeft: -(height * PULL_RATIO),
            transform: `translateY(${height * DROP_RATIO}px)`,
          }}
        >
          {word}
        </span>
      </div>

      {strapline && (
        <p
          className="text-muted-foreground"
          style={{
            fontSize: Math.max(11, height * 0.146),
            transform: `translateX(${height * STRAP_RATIO}px)`,
          }}
        >
          {strapline}
        </p>
      )}
    </div>
  )
}

/** The mark on its own, for places with no room for the word. */
export function BrandMark({ className = 'h-8' }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- local brand asset, no loader needed
    <img src="/spika-s-red.png" alt="SPika" className={`w-auto shrink-0 ${className}`} />
  )
}
