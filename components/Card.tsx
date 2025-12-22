import Image from 'next/image'
import { Card as CardType } from '@/lib/types/poker'

interface CardProps {
  card: CardType
  className?: string
  faceDown?: boolean
}

// Fixed card dimensions - all cards use the same size (in rem)
const CARD_WIDTH = 5 // 5rem = 80px
const CARD_HEIGHT = 7 // 7rem = 112px

export function Card({ card, className = '', faceDown = false }: CardProps) {
  return (
    <div 
      className={`relative bg-white rounded-lg p-1 shadow-sm ${className}`} 
      style={{ width: `${CARD_WIDTH}rem`, height: `${CARD_HEIGHT}rem` }}
    >
      {faceDown ? (
        <Image
          src="/cards/back.png"
          alt="Card back"
          width={CARD_WIDTH * 16 - 8}
          height={CARD_HEIGHT * 16 - 8}
          className="object-contain rounded-md"
          style={{ width: '100%', height: '100%' }}
          priority
        />
      ) : (
        <Image
          src={`/cards/${card}.png`}
          alt={card}
          width={CARD_WIDTH * 16 - 8}
          height={CARD_HEIGHT * 16 - 8}
          className="object-contain rounded-md"
          style={{ width: '100%', height: '100%' }}
          priority
        />
      )}
    </div>
  )
}

