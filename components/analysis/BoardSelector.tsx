"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

const SUITS = ["s", "h", "d", "c"];
const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const SUIT_ICONS: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
const SUIT_COLORS: Record<string, string> = { s: "text-slate-900", h: "text-red-600", d: "text-blue-600", c: "text-emerald-600" };

interface BoardSelectorProps {
  value: string[];
  onChange: (cards: string[]) => void;
}

export function BoardSelector({ value, onChange }: BoardSelectorProps) {
  const [activeSlot, setActiveSlot] = useState<number | null>(null);

  const handleSelectCard = (card: string) => {
    if (activeSlot === null) return;
    
    const newBoard = [...value];
    // Check if this card is already selected anywhere
    const existingIdx = newBoard.indexOf(card);
    if (existingIdx !== -1) {
      // If clicking the same card in the same slot, deselect it
      if (existingIdx === activeSlot) {
        newBoard.splice(existingIdx, 1);
        onChange(newBoard);
        setActiveSlot(null);
        return;
      }
      // Otherwise, remove it from its current position
      newBoard.splice(existingIdx, 1);
    }
    
    // Replace card at active slot, or insert if slot is beyond current length
    if (activeSlot < newBoard.length) {
      newBoard[activeSlot] = card; // Replace at specific index
    } else {
      newBoard.push(card); // Append if slot is beyond current length
    }
    
    // Ensure max 5 cards
    const finalBoard = newBoard.slice(0, 5);
    
    onChange(finalBoard);
    setActiveSlot(null);
  };

  const removeCard = (index: number) => {
    const newBoard = [...value];
    newBoard.splice(index, 1);
    onChange(newBoard);
  };

  const isCardSelected = (card: string) => value.includes(card);

  // Render 5 slots. Some filled, some empty.
  const slots = [0, 1, 2, 3, 4];

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium">Community Cards</label>
      <div className="flex gap-2">
        {slots.map((index) => {
          const card = value[index];
          const isActive = activeSlot === index;
          
          return (
            <Popover key={index} open={isActive} onOpenChange={(open) => !open && setActiveSlot(null)}>
              <PopoverTrigger asChild>
                <div 
                  onClick={() => setActiveSlot(index)}
                  className={cn(
                    "h-16 w-12 border-2 rounded flex flex-col items-center justify-center cursor-pointer transition-all relative",
                    card 
                      ? "bg-white border-slate-300" 
                      : "bg-slate-100 border-dashed border-slate-300 hover:border-slate-400",
                    isActive && "ring-2 ring-primary border-primary"
                  )}
                >
                  {card ? (
                    <>
                      <span className={cn("font-bold text-lg leading-none", SUIT_COLORS[card[1]])}>
                        {card[0]}
                      </span>
                      <span className={cn("text-xl leading-none", SUIT_COLORS[card[1]])}>
                        {SUIT_ICONS[card[1]]}
                      </span>
                      {/* Quick remove button */}
                      <div 
                        role="button"
                        onClick={(e) => { e.stopPropagation(); removeCard(index); }}
                        className="absolute -top-2 -right-2 bg-slate-900 text-white rounded-full p-0.5 opacity-0 hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </div>
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
                        return (
                          <button
                            key={cardId}
                            onClick={() => handleSelectCard(cardId)}
                            className={cn(
                              "h-8 w-6 text-xs border rounded flex items-center justify-center bg-white hover:bg-slate-100",
                              SUIT_COLORS[suit],
                              selected && "opacity-30 bg-slate-200 cursor-pointer"
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
      <p className="text-xs text-muted-foreground">
        Select 3, 4, or 5 cards for evaluation.
      </p>
    </div>
  );
}

