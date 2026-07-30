type ProductMarkProps = {
  className?: string
  compact?: boolean
}

export default function ProductMark({
  className = "",
  compact = false,
}: ProductMarkProps) {
  return (
    <span className={className} aria-label="Electric Relic">
      <svg viewBox="0 0 48 48" role="img" aria-hidden="true">
        <path d="M24 3 41 13v22L24 45 7 35V13L24 3Z" />
        <path d="m24 11 9 6v14l-9 6-9-6V17l9-6Z" />
        <path d="m24 11-4 12h7l-4 14" />
      </svg>
      {!compact && (
        <span>
          ELECTRIC
          <b>RELIC</b>
        </span>
      )}
    </span>
  )
}
