'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ActionValidation } from '@/lib/poker-game/ui/legacyTypes'

interface ActionModalProps {
  open: boolean
  onClose: () => void
  onAction: (action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin', amount?: number) => void
  validation: ActionValidation & { action?: 'bet' | 'raise' }
  currentBet: number
  playerChips: number
  chipsToCall: number
  canCheck: boolean
}

export function ActionModal({
  open,
  onClose,
  onAction,
  validation,
  currentBet,
  playerChips,
  chipsToCall,
  canCheck,
}: ActionModalProps) {
  const [betAmount, setBetAmount] = useState(0)
  const [raiseAmount, setRaiseAmount] = useState(0)

  useEffect(() => {
    if (validation.minAmount !== undefined) {
      if (canCheck && validation.action === 'bet') {
        setBetAmount(validation.minAmount)
      } else if (!canCheck && validation.action === 'raise') {
        setRaiseAmount(validation.minAmount)
      }
    }
  }, [validation, canCheck])

  const handleFold = () => {
    onAction('fold')
    onClose()
  }

  const handleCheck = () => {
    onAction('check')
    onClose()
  }

  const handleCall = () => {
    onAction('call')
    onClose()
  }

  const handleBet = () => {
    if (betAmount >= validation.minAmount! && betAmount <= validation.maxAmount!) {
      onAction('bet', betAmount)
      onClose()
    }
  }

  const handleRaise = () => {
    if (raiseAmount >= validation.minAmount! && raiseAmount <= validation.maxAmount!) {
      onAction('raise', raiseAmount)
      onClose()
    }
  }

  const handleAllIn = () => {
    onAction('allin')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your Action</DialogTitle>
          <DialogDescription>
            {canCheck ? 'You can check or bet' : `You need to call ${chipsToCall} or raise`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {canCheck ? (
            <>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCheck} className="flex-1">
                  Check
                </Button>
                <Button variant="destructive" onClick={handleFold} className="flex-1">
                  Fold
                </Button>
              </div>
              {playerChips > 0 && (
                <Button variant="secondary" onClick={handleAllIn} className="w-full">
                  All-In ({playerChips})
                </Button>
              )}

              {canCheck && validation.action === 'bet' && validation.valid && (
                <div className="space-y-4">
                  <div>
                    <Label>Bet Amount</Label>
                    <div className="flex gap-2 mt-2">
                      <Slider
                        value={[betAmount]}
                        onValueChange={([value]) => setBetAmount(value)}
                        min={validation.minAmount || 0}
                        max={validation.maxAmount || playerChips}
                        step={1}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        value={betAmount}
                        onChange={(e) => setBetAmount(Number(e.target.value))}
                        min={validation.minAmount}
                        max={validation.maxAmount}
                        className="w-24"
                      />
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Min: {validation.minAmount} | Max: {validation.maxAmount}
                    </p>
                  </div>
                  <Button onClick={handleBet} className="w-full">
                    Bet {betAmount}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCall} className="flex-1">
                  Call {chipsToCall}
                </Button>
                <Button variant="destructive" onClick={handleFold} className="flex-1">
                  Fold
                </Button>
              </div>
              {playerChips > 0 && (
                <Button variant="secondary" onClick={handleAllIn} className="w-full">
                  All-In ({playerChips})
                </Button>
              )}

              {!canCheck && validation.action === 'raise' && validation.valid && (
                <div className="space-y-4">
                  <div>
                    <Label>Raise Amount (on top of call)</Label>
                    <div className="flex gap-2 mt-2">
                      <Slider
                        value={[raiseAmount]}
                        onValueChange={([value]) => setRaiseAmount(value)}
                        min={validation.minAmount || 0}
                        max={validation.maxAmount || playerChips - chipsToCall}
                        step={1}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        value={raiseAmount}
                        onChange={(e) => setRaiseAmount(Number(e.target.value))}
                        min={validation.minAmount}
                        max={validation.maxAmount}
                        className="w-24"
                      />
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Min: {validation.minAmount} | Max: {validation.maxAmount}
                    </p>
                  </div>
                  <Button onClick={handleRaise} className="w-full">
                    Raise to {currentBet + raiseAmount}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

