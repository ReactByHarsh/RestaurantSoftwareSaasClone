import { useEffect, useState } from 'react'
import { ImageIcon } from 'lucide-react'
import { clsx } from 'clsx'

interface Props {
  src?: string
  alt: string
  className?: string
  iconSize?: number
}

export default function MenuItemThumb({ src, alt, className, iconSize = 16 }: Props) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  return (
    <span className={clsx('flex items-center justify-center overflow-hidden bg-slate-100', className)}>
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <ImageIcon size={iconSize} className="text-slate-300" strokeWidth={2} />
      )}
    </span>
  )
}
