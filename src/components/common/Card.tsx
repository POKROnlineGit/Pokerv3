import Image from 'next/image'
import { Card as CardType } from '@/lib/types/poker'
import { motion, AnimatePresence } from 'framer-motion'
import { memo, useMemo } from 'react'
import { usePreferences } from '@/components/providers/PreferencesProvider'
import { SimplifiedCardFace } from './SimplifiedCardFace'

interface CardProps {
  card: CardType | 'HIDDEN'
  className?: string
  faceDown?: boolean
}

// Fixed card dimensions - all cards use the same size (in rem)
const CARD_WIDTH = 5 // 5rem = 80px
const CARD_HEIGHT = 7 // 7rem = 112px

// Parse card string into rank and suit (e.g., "Ah" -> { rank: "A", suit: "h" })
function parseCard(card: string): { rank: string; suit: string } | null {
  if (!card || card === 'HIDDEN') return null
  // Card format: rank + suit (e.g., "Ah", "10s", "2d")
  // Rank can be 1-2 chars (2-9, 10, J, Q, K, A)
  // Suit is single char (h, d, c, s)
  const suit = card.slice(-1).toLowerCase()
  const rank = card.slice(0, -1)
  return { rank, suit }
}

function CardComponent({ card, className = '', faceDown = false }: CardProps) {
  const { cardStyle } = usePreferences()
  const isHidden = card === 'HIDDEN' || faceDown
  const showCardBack = isHidden

  // Parse card for simplified rendering
  const parsedCard = useMemo(() => {
    if (card === 'HIDDEN') return null
    return parseCard(card)
  }, [card])

  const useSimplifiedFace = cardStyle !== 'standard' && parsedCard && !showCardBack

  return (
    <motion.div
      className={`relative bg-white rounded-lg p-1 shadow-sm ${className}`}
      style={{ width: `${CARD_WIDTH}rem`, height: `${CARD_HEIGHT}rem`, minWidth: `${CARD_WIDTH}rem`, minHeight: `${CARD_HEIGHT}rem` }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {showCardBack ? (
          <motion.div
            key="back"
            initial={{ rotateY: 90, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={{ rotateY: -90, opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
          >
            <Image
              src="/cards/back.png"
              alt="Card back"
              width={CARD_WIDTH * 16 - 8}
              height={CARD_HEIGHT * 16 - 8}
              className="object-contain rounded-md"
              style={{ width: '100%', height: '100%' }}
              priority
            />
          </motion.div>
        ) : useSimplifiedFace && parsedCard ? (
          <motion.div
            key={`face-${cardStyle}`}
            initial={{ rotateY: -90, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={{ rotateY: 90, opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
          >
            <SimplifiedCardFace
              rank={parsedCard.rank}
              suit={parsedCard.suit}
              cardStyle={cardStyle}
            />
          </motion.div>
        ) : (
          <motion.div
            key="face-standard"
            initial={{ rotateY: -90, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={{ rotateY: 90, opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
          >
            <Image
              src={`/cards/${card}.png`}
              alt={card}
              width={CARD_WIDTH * 16 - 8}
              height={CARD_HEIGHT * 16 - 8}
              className="object-contain rounded-md"
              style={{ width: '100%', height: '100%' }}
              priority
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// Memoize Card component to prevent unnecessary rerenders
export const Card = memo(CardComponent)

