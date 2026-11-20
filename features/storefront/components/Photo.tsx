/** A real photo from the practice's records, or a plain panel that says there is none yet. */
export function Photo({ src, alt, shape = 'wide', eager = false }: { src?: string | null; alt: string; shape?: 'wide' | 'portrait' | 'thumb'; eager?: boolean }) {
  return (
    <div className={`sf-photo sf-photo--${shape}`}>
      {src
        ? <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" />
        : <span className="sf-photo__none">No photo yet</span>}
    </div>
  )
}
