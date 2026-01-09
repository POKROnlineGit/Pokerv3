"use client";

import React from "react";
import { cn } from "@/lib/utils";

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

interface RangeGridProps {
  selectedHands: Set<string>;
  onToggle: (hand: string) => void;
  isMouseDown?: boolean;
  onMouseEnter?: (hand: string) => void;
}

export function RangeGrid({
  selectedHands,
  onToggle,
  isMouseDown,
  onMouseEnter,
}: RangeGridProps) {
  const gridCells = React.useMemo(() => {
    const cells = [];

    for (let row = 0; row < 13; row++) {
      for (let col = 0; col < 13; col++) {
        const r1 = RANKS[row];
        const r2 = RANKS[col];
        let handLabel = "";
        let type = "";

        if (row === col) {
          handLabel = `${r1}${r1}`;
          type = "pair";
        } else if (row < col) {
          handLabel = `${r1}${r2}s`;
          type = "suited";
        } else {
          handLabel = `${r2}${r1}o`;
          type = "offsuit";
        }

        const isSelected = selectedHands.has(handLabel);

        cells.push(
          <button
            key={handLabel}
            onMouseDown={() => onToggle(handLabel)}
            onMouseEnter={() =>
              isMouseDown && onMouseEnter && onMouseEnter(handLabel)
            }
            className={cn(
              "text-[9px] font-medium border border-slate-800 flex items-center justify-center transition-colors select-none",
              "aspect-square w-full h-full",
              isSelected
                ? type === "pair"
                  ? "bg-emerald-600 text-white"
                  : type === "suited"
                  ? "bg-blue-600 text-white"
                  : "bg-amber-600 text-white"
                : "bg-slate-900 text-slate-400 hover:bg-slate-800"
            )}
          >
            {handLabel}
          </button>
        );
      }
    }

    return cells;
  }, [selectedHands, onToggle, isMouseDown, onMouseEnter]);

  return (
    <div className="overflow-auto bg-white/5 p-1 rounded border border-slate-600 flex justify-center" style={{ width: 'fit-content', maxWidth: '100%', margin: '0 auto' }}>
      <div
        className="inline-grid bg-slate-800 border-2 border-slate-400 p-1 select-none"
        style={{
          gridTemplateColumns: "repeat(13, minmax(1.25rem, 1.5rem))",
          gridTemplateRows: "repeat(13, minmax(1.25rem, 1.5rem))",
          gap: "1px",
          minWidth: "fit-content",
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {gridCells.length === 169 ? (
          gridCells
        ) : (
          <div className="col-span-13 p-4 text-center text-red-500">
            Grid Error: Expected 169 cells, got {gridCells.length}
          </div>
        )}
      </div>
    </div>
  );
}
