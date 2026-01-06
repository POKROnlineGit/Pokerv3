"use client";

import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const SUITS = ["s", "h", "d", "c"];
const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const SUIT_ICONS: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
const SUIT_COLORS: Record<string, string> = { s: "text-slate-900", h: "text-red-600", d: "text-blue-600", c: "text-emerald-600" };

interface HandSelectorProps {
  label?: string;
  value: string[];
  onChange: (cards: string[]) => void;
  disabled?: boolean;
  excludedCards?: string[];
}

export function HandSelector({ label, value, onChange, disabled, excludedCards = [] }: HandSelectorProps) {
  const [activeSlot, setActiveSlot] = useState<number | null>(null);

  const handleSelectCard = (card: string) => {
    if (activeSlot === null) return;
    const newHand = [...value];
    
    // Check if this card is already selected
    const existingIdx = newHand.indexOf(card);
    if (existingIdx !== -1) {
      // If clicking the same card in the same slot, deselect it
      if (existingIdx === activeSlot) {
        newHand[activeSlot] = "";
        onChange(newHand);
        setActiveSlot(null);
        return;
      }
      // Otherwise, remove it from its current position
      newHand[existingIdx] = "";
    }
    
    newHand[activeSlot] = card;
    onChange(newHand);
    setActiveSlot(null);
  };

  const handleCardClick = (index: number) => {
    if (disabled) return;
    // If card is already selected in this slot, deselect it by clicking
    if (value[index]) {
      const newHand = [...value];
      newHand[index] = "";
      onChange(newHand);
    } else {
      // Otherwise, open the popover
      setActiveSlot(index);
    }
  };

  const isCardSelected = (card: string) => value.includes(card);
  const isCardExcluded = (card: string) => excludedCards.includes(card) && !value.includes(card);

  // Always 2 slots for a hand
  const slots = [0, 1];

  return (
    <div className="space-y-1">
      {label && <label className="text-xs font-medium text-muted-foreground">{label}</label>}
      <div className="flex gap-2">
        {slots.map((index) => {
          const card = value[index];
          const isActive = activeSlot === index;
          
          return (
            <Popover key={index} open={isActive} onOpenChange={(open) => !open && setActiveSlot(null)}>
              <PopoverTrigger asChild>
                <div 
                  onClick={() => handleCardClick(index)}
                  className={cn(
                    "h-14 w-10 border-2 rounded flex flex-col items-center justify-center cursor-pointer transition-all relative select-none",
                    card 
                      ? "bg-white border-slate-300" 
                      : "bg-slate-100 border-dashed border-slate-300 hover:border-slate-400",
                    isActive && "ring-2 ring-primary border-primary",
                    disabled && "opacity-50 cursor-not-allowed"
                  )}
                  style={{ boxSizing: "border-box" }}
                >
                  {card ? (
                    <>
                      <span
                        className={cn(
                          "font-bold text-sm leading-none",
                          SUIT_COLORS[card[1]]
                        )}
                      >
                        {card[0]}
                      </span>
                      <span
                        className={cn(
                          "text-base leading-none",
                          SUIT_COLORS[card[1]]
                        )}
                      >
                        {SUIT_ICONS[card[1]]}
                      </span>
                    </>
                  ) : (
                    <span className="text-slate-400 text-xs">+</span>
                  )}
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" align="start">
                <div className="grid grid-cols-[repeat(13,minmax(0,1fr))] gap-1">
                  {RANKS.map(rank => (
                    <div key={rank} className="flex flex-col gap-1">
                      {SUITS.map(suit => {
                        const cardId = `${rank}${suit}`;
                        const selected = isCardSelected(cardId);
                        const excluded = isCardExcluded(cardId);
                        return (
                          <button
                            key={cardId}
                            onClick={() => handleSelectCard(cardId)}
                            disabled={excluded}
                            className={cn(
                              "h-8 w-6 text-xs border rounded flex items-center justify-center bg-white hover:bg-slate-100",
                              SUIT_COLORS[suit],
                              selected &&
                                "opacity-30 bg-slate-200 cursor-pointer",
                              excluded &&
                                "opacity-30 bg-slate-200 cursor-not-allowed"
                            )}
                          >
                            {rank}{SUIT_ICONS[suit]}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          );
        })}
      </div>
    </div>
  );
}

