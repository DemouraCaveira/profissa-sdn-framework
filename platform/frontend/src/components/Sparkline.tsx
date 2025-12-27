import React from 'react'

type Props = {
  values: number[]
  stroke?: string
}

export const Sparkline: React.FC<Props> = ({ values, stroke = '#38bdf8' }) => {
  if (!values.length) return <span className="sparkline" />
  const width = 120
  const height = 32
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const points = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * width
      const y = height - ((v - min) / span) * height
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`}>
      <polyline fill="none" stroke={stroke} strokeWidth={2} points={points} />
    </svg>
  )
}
