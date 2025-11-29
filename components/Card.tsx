import Image from 'next/image'
import { Card as CardType } from '@/lib/poker-game/legacyTypes'

interface CardProps {
  card: CardType
  className?: string
  size?: 'sm' | 'md' | 'lg'
  faceDown?: boolean
}

const sizeMap = {
  sm: { width: 60, height: 84 },
  md: { width: 80, height: 112 },
  lg: { width: 100, height: 140 }
}

export function Card({ card, className = '', size = 'md', faceDown = false }: CardProps) {
  const dimensions = sizeMap[size]
  
  return (
    <div 
      className={`relative bg-white rounded-lg p-1 shadow-sm ${className}`} 
      style={{ width: dimensions.width, height: dimensions.height }}
    >
      {faceDown ? (
        <Image
          src="/cards/back.png"
          alt="Card back"
          width={dimensions.width - 8}
          height={dimensions.height - 8}
          className="object-contain rounded-md"
          style={{ width: '100%', height: '100%' }}
          priority
        />
      ) : (
        <Image
          src={`/cards/${card}.png`}
          alt={card}
          width={dimensions.width - 8}
          height={dimensions.height - 8}
          className="object-contain rounded-md"
          style={{ width: '100%', height: '100%' }}
          priority
        />
      )}
    </div>
  )
}

