/**
 * PokerOnline Global Motion Settings
 * All animations MUST use these presets - never arbitrary values
 */

export const transition = {
  type: "spring" as const,
  stiffness: 400,
  damping: 30,
  mass: 0.8,
}

export const fastTransition = {
  duration: 0.2,
  ease: "easeOut" as const,
}

export const springTransition = {
  type: "spring" as const,
  stiffness: 300,
  damping: 30,
}

export const tweenTransition = {
  type: "tween" as const,
  duration: 0.3,
}

