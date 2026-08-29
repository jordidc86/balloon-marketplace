'use client'

import Image from 'next/image'
import { ImageOff } from 'lucide-react'
import { useState } from 'react'

export default function SafeListingImage({
  src,
  alt,
  sizes,
  className,
  priority = false,
  compact = false,
}: {
  src: string
  alt: string
  sizes: string
  className?: string
  priority?: boolean
  compact?: boolean
}) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div role="img" aria-label={`${alt}: image unavailable`} className="absolute inset-0 flex flex-col items-center justify-center bg-muted text-muted-foreground/60">
        <ImageOff className={compact ? 'h-5 w-5' : 'h-9 w-9'} />
        {!compact ? <span className="mt-2 text-xs font-medium">Image temporarily unavailable</span> : null}
      </div>
    )
  }

  return <Image src={src} alt={alt} fill sizes={sizes} className={className} priority={priority} onError={() => setFailed(true)} />
}
