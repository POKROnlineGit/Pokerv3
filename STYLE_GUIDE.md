# PokerOnline Official Style Guide + Framer Motion Animation Standard

**Version 1.0** | **Last Updated**: 2025-11-29

---

## 🎯 PROJECT NAME

**PokerOnline** – Premium real-time Texas Hold'em platform

---

## 1. OFFICIAL COLOR PALETTE

**Exact hex values – never deviate**

```css
--color-primary-500: #9A1F40;   /* Main maroon */
--color-primary-600: #861A38;   /* Hover / pressed */
--color-primary-700: #6B152C;   /* Strong emphasis */
--color-primary-800: #5B1125;   /* Dark mode accent */

--color-success:     #22C55E;   /* Pot wins, chips */
--color-white:       #FFFFFF;
--color-gray-50:     #FAFAFA;
--color-gray-100:    #F5F5F5;
--color-gray-200:    #E5E5E5;
--color-gray-300:    #D4D4D4;
--color-gray-500:    #737373;
--color-gray-600:    #525252;
--color-gray-700:    #404040;
--color-gray-800:    #262626;
--color-gray-900:    #171717;
--color-black:       #0F0F0F;
```

### Usage in Tailwind

```tsx
// Primary colors
className="bg-primary-500"      // Main maroon
className="bg-primary-600"      // Hover state
className="text-primary-700"     // Strong emphasis
className="border-primary-800"   // Dark mode accent

// Success (chips, pot wins)
className="bg-success text-white"

// Grays
className="bg-gray-50"           // Lightest
className="text-gray-900"        // Darkest text
```

---

## 2. TYPOGRAPHY

**Exact Tailwind classes only – no arbitrary values**

| Element | Class | Usage |
|---------|-------|-------|
| Hero | `text-5xl font-bold tracking-tight` | Landing page hero text |
| Page title | `text-4xl font-bold` | Main page headings |
| Section title | `text-3xl font-semibold` | Section headers |
| Card title | `text-2xl font-semibold` | Card headings |
| Username | `text-xl font-medium` | Player names, usernames |
| Body | `text-base` | Default text (16px) |
| Small | `text-sm` | Secondary text |
| Tiny | `text-xs font-medium` | Labels, badges |

### Examples

```tsx
<h1 className="text-5xl font-bold tracking-tight">PokerOnline</h1>
<h2 className="text-4xl font-bold">Play Poker</h2>
<h3 className="text-3xl font-semibold">Game Settings</h3>
<p className="text-base">Welcome to the table</p>
<span className="text-sm text-gray-500">Last updated</span>
```

---

## 3. SPACING, RADIUS, SHADOWS

### Border Radius

- **Buttons, Cards, Modals**: `rounded-xl` (12px)
- **Poker Table**: `rounded-2xl` (16px)
- **Never use**: `rounded-lg`, `rounded-md`, or arbitrary values

### Shadows

- **Default**: `shadow-lg`
- **Poker Table & Hero Modals**: `shadow-xl`
- **Never use**: `shadow-sm`, `shadow-md`, or arbitrary values

### Spacing

- **Use Tailwind 4-based scale only**
- Common: `p-4`, `p-6`, `p-8`, `gap-4`, `gap-6`, `space-y-4`

---

## 4. FRAMER MOTION – MANDATORY ANIMATION STANDARDS

### Installation

```bash
npm install framer-motion
```

### Global Motion Settings

Located in `lib/motion.config.ts`:

```typescript
export const transition = {
  type: "spring",
  stiffness: 400,
  damping: 30,
  mass: 0.8,
}

export const fastTransition = {
  duration: 0.2,
  ease: "easeOut",
}
```

### Required Animations

#### 1. Page / Layout Entry

```tsx
import { PageTransition } from '@/components/motion'

<PageTransition>
  {children}
</PageTransition>
```

**Or manually:**
```tsx
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.4 }}
>
```

#### 2. Cards Dealing (Hole Cards & Community Cards)

```tsx
import { DealCard } from '@/components/motion'

<DealCard index={0} delay={0}>
  <Card card="Ah" />
</DealCard>
```

**Or manually:**
```tsx
<motion.div
  initial={{ y: -80, rotate: -180, opacity: 0 }}
  animate={{ y: 0, rotate: 0, opacity: 1 }}
  transition={{ ...transition, delay: index * 0.1 }}
  layout
/>
```

#### 3. Action Modal Slide-Up

```tsx
import { ActionModalMotion } from '@/components/motion'

<ActionModalMotion>
  {/* Modal content */}
</ActionModalMotion>
```

**Or manually:**
```tsx
<motion.div
  initial={{ y: "100%", opacity: 0 }}
  animate={{ y: 0, opacity: 1 }}
  exit={{ y: "100%", opacity: 0 }}
  transition={{ type: "spring", stiffness: 300, damping: 30 }}
  className="fixed inset-x-0 bottom-0"
/>
```

#### 4. Button Press

```tsx
import { MotionButton } from '@/components/motion'

<MotionButton>Click Me</MotionButton>
```

**Or manually:**
```tsx
<motion.button
  whileHover={{ scale: 1.02 }}
  whileTap={{ scale: 0.95 }}
  transition={fastTransition}
>
```

#### 5. Chips Movement / Pot Award

```tsx
import { ChipMotion } from '@/components/motion'

<ChipMotion>
  <div className="chip">1000</div>
</ChipMotion>
```

**Or manually:**
```tsx
<motion.div
  initial={{ scale: 0, y: 100 }}
  animate={{ scale: 1, y: 0 }}
  transition={{ type: "spring", stiffness: 500, damping: 20 }}
/>
```

#### 6. Sidebar Slide-In (Mobile)

```tsx
import { SidebarMotion } from '@/components/motion'

<SidebarMotion>
  {/* Sidebar content */}
</SidebarMotion>
```

**Or manually:**
```tsx
<motion.div
  initial={{ x: -300 }}
  animate={{ x: 0 }}
  exit={{ x: -300 }}
  transition={{ type: "tween", duration: 0.3 }}
/>
```

#### 7. Hover Lift (Cards, Seats, Lesson Cards)

```tsx
import { MotionCard } from '@/components/motion'

<MotionCard hover={true}>
  {/* Card content */}
</MotionCard>
```

**Or manually:**
```tsx
<motion.div
  whileHover={{ y: -8, scale: 1.03 }}
  transition={transition}
/>
```

---

## 5. POKER-SPECIFIC STYLES

### Poker Felt Background

```tsx
<div className="bg-poker-felt">
  {/* Poker table content */}
</div>
```

**CSS:**
```css
.bg-poker-felt {
  background: linear-gradient(135deg, #0F3821 0%, #0B2A1A 100%);
}
```

### Wooden Table Edge

```tsx
<div className="border-wood rounded-2xl">
  {/* Table content */}
</div>
```

**CSS:**
```css
.border-wood {
  border: 12px solid #8B4513;
  box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.6);
}
```

### Active Player Glow

```tsx
<div className="ring-active">
  {/* Active player seat */}
</div>
```

**CSS:**
```css
.ring-active {
  @apply ring-4 ring-primary-500 ring-offset-8 ring-offset-transparent;
}
```

---

## 6. GLOBAL CSS

Located in `app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --color-primary-500: #9A1F40;
  --color-primary-600: #861A38;
  /* ... all colors ... */
}

.dark {
  --color-primary-500: #B91C1C;
  --color-primary-600: #DC2626;
}

::selection {
  @apply bg-primary-500 text-white;
}

html {
  scroll-behavior: smooth;
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 7. TAILWIND CONFIG

Located in `tailwind.config.ts`:

```typescript
extend: {
  colors: {
    primary: {
      500: "var(--color-primary-500)",
      600: "var(--color-primary-600)",
      700: "var(--color-primary-700)",
      800: "var(--color-primary-800)",
    },
    success: "var(--color-success)",
  },
  animation: {
    "deal-card": "deal 0.6s ease-out forwards",
  },
}
```

---

## 8. FUTURE AI PROMPT RULES – NON-NEGOTIABLE

**Every time you or any AI generates new code for PokerOnline, you MUST:**

✅ **Use only the exact colors defined above**  
✅ **Use only `rounded-xl` or `rounded-2xl`**  
✅ **Wrap every interactive element in appropriate Framer Motion with the presets above**  
✅ **Use `whileHover={{ y: -8 }}` or `whileTap={{ scale: 0.95 }}` on all clickable items**  
✅ **Deal cards with the exact dealing animation (spring + delay by index)**  
✅ **Use `bg-poker-felt` + wooden border on all poker tables**  
✅ **Never use arbitrary values – always reference this guide**

### ❌ FORBIDDEN

- Arbitrary color values like `bg-[#123456]`
- Arbitrary border radius like `rounded-[10px]`
- Custom animation values not in this guide
- Missing Framer Motion on interactive elements
- Using `rounded-lg`, `rounded-md`, or other radius values
- Custom shadows not defined above

---

## 9. COMPONENT EXAMPLES

### Example: Animated Button

```tsx
import { MotionButton } from '@/components/motion'

<MotionButton className="bg-primary-500 hover:bg-primary-600 rounded-xl shadow-lg">
  Find Game
</MotionButton>
```

### Example: Poker Table

```tsx
<div className="bg-poker-felt border-wood rounded-2xl shadow-xl p-8">
  {/* Table content */}
</div>
```

### Example: Dealing Cards

```tsx
import { DealCard } from '@/components/motion'
import { Card } from '@/components/Card'

{cards.map((card, index) => (
  <DealCard key={card} index={index}>
    <Card card={card} />
  </DealCard>
))}
```

### Example: Lesson Card

```tsx
import { MotionCard } from '@/components/motion'

<MotionCard hover={true} className="rounded-xl shadow-lg">
  <h3 className="text-2xl font-semibold">Preflop Basics</h3>
</MotionCard>
```

---

## 10. FILE STRUCTURE

```
lib/
  motion.config.ts          # Global motion settings

components/
  motion/
    MotionButton.tsx         # Animated button
    MotionCard.tsx           # Animated card with hover
    DealCard.tsx             # Card dealing animation
    PageTransition.tsx        # Page entry animation
    ActionModalMotion.tsx     # Modal slide-up
    ChipMotion.tsx            # Chip movement
    SidebarMotion.tsx         # Sidebar slide-in
    index.ts                 # Exports

app/
  globals.css                # Global styles + poker-specific

tailwind.config.ts          # Tailwind config with custom colors

STYLE_GUIDE.md              # This file
```

---

## 11. QUICK REFERENCE

### Colors
- Primary: `bg-primary-500`, `bg-primary-600`, `bg-primary-700`, `bg-primary-800`
- Success: `bg-success`
- Grays: `bg-gray-50` through `bg-gray-900`

### Typography
- Hero: `text-5xl font-bold tracking-tight`
- Page: `text-4xl font-bold`
- Section: `text-3xl font-semibold`
- Card: `text-2xl font-semibold`

### Radius
- Default: `rounded-xl` (12px)
- Table: `rounded-2xl` (16px)

### Shadows
- Default: `shadow-lg`
- Table/Modal: `shadow-xl`

### Motion Components
- `MotionButton` - Button with hover/tap
- `MotionCard` - Card with hover lift
- `DealCard` - Card dealing animation
- `PageTransition` - Page entry
- `ActionModalMotion` - Modal slide-up
- `ChipMotion` - Chip movement
- `SidebarMotion` - Sidebar slide-in

---

**This guide is the single source of truth for all PokerOnline styling and animations. Follow it strictly.**

