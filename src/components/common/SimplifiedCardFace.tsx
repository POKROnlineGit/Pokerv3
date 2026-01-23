'use client'

import { memo } from 'react'
import { CardStyle } from '@/lib/features/preferences/types'

interface SimplifiedCardFaceProps {
  rank: string
  suit: string
  cardStyle: CardStyle
}

// Suit symbols
const SUIT_SYMBOLS: Record<string, string> = {
  h: '♥',
  d: '♦',
  c: '♣',
  s: '♠',
}

// 4-Color mode colors
const FOUR_COLOR_MAP: Record<string, string> = {
  h: '#DC2626', // Red
  d: '#2563EB', // Blue
  c: '#16A34A', // Green
  s: '#1F2937', // Black/Gray
}

// 2-Color mode colors
const TWO_COLOR_MAP: Record<string, string> = {
  h: '#DC2626', // Red
  d: '#DC2626', // Red
  c: '#1F2937', // Black
  s: '#1F2937', // Black
}

// Convert rank from card string format to display format
function formatRank(rank: string): string {
  if (rank === '10') return 'T'
  return rank.toUpperCase()
}

function SimplifiedCardFaceComponent({ rank, suit, cardStyle }: SimplifiedCardFaceProps) {
  const suitLower = suit.toLowerCase()
  const suitSymbol = SUIT_SYMBOLS[suitLower] || suit
  const displayRank = formatRank(rank)

  const color = cardStyle === 'simplified_4color'
    ? FOUR_COLOR_MAP[suitLower] || '#1F2937'
    : TWO_COLOR_MAP[suitLower] || '#1F2937'

  return (
    <div
      className="w-full h-full bg-white rounded-md flex flex-col justify-between p-1.5 select-none"
      style={{ color }}
    >
      {/* Top-left corner */}
      <div className="flex flex-row items-start leading-none">
        <span className="text-3xl font-bold">{displayRank}</span>
        <span className="text-3xl">{suitSymbol}</span>
      </div>

      {/* Bottom-right corner */}
      <div className="flex flex-row-reverse items-end leading-none">
        <span className="text-3xl font-bold">{displayRank}</span>
        <span className="text-3xl">{suitSymbol}</span>
      </div>
    </div>
  )
}

export const SimplifiedCardFace = memo(SimplifiedCardFaceComponent)
