"use client";

import React from "react";
import { cn } from "@/lib/utils";

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

interface RangeGridProps {
  // === EXISTING PROPS (Selection Mode) - unchanged ===
  selectedHands: Set<string>;
  onToggle: (hand: string) => void;
  isMouseDown?: boolean;
  onMouseEnter?: (hand: string) => void;

  // === NEW OPTIONAL PROPS (Stats Mode) ===
  /** Stats data - when provided, enables stats display mode */
  statsData?: Map<string, { percentage: number; sampleSize: number }>;
  /** Callback when hovering over a cell in stats mode */
  onCellHover?: (hand: string | null) => void;
  /** Currently hovered hand (for highlighting) */
  hoveredHand?: string | null;
  /** Read-only mode - disables click interactions */
  readOnly?: boolean;
  /** Additional CSS classes for the outer container */
  className?: string;
}

function getColorForType(type: 'pair' | 'suited' | 'offsuit'): string {
  switch (type) {
    case 'pair': return 'rgb(5, 150, 105)';    // emerald-600
    case 'suited': return 'rgb(37, 99, 235)';  // blue-600
    case 'offsuit': return 'rgb(217, 119, 6)'; // amber-600
  }
}

export function RangeGrid({
  selectedHands,
  onToggle,
  isMouseDown,
  onMouseEnter,
  statsData,
  onCellHover,
  hoveredHand,
  readOnly,
  className,
}: RangeGridProps) {
  // Determine mode based on props
  const isStatsMode = statsData !== undefined;

  const gridCells = React.useMemo(() => {
    const cells = [];

    for (let row = 0; row < 13; row++) {
      for (let col = 0; col < 13; col++) {
        const r1 = RANKS[row];
        const r2 = RANKS[col];
        let handLabel = "";
        let type: 'pair' | 'suited' | 'offsuit' = 'pair';

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
        const isHovered = hoveredHand === handLabel;

        // Stats mode specific data
        const cellData = statsData?.get(handLabel);
        const percentage = cellData?.percentage ?? 0;

        // Determine cell style based on mode
        let cellStyle: React.CSSProperties | undefined;
        let cellClassName: string;

        if (isStatsMode) {
          // Stats mode: gradient fill based on percentage - single emerald color for all
          const color = 'rgb(5, 150, 105)'; // emerald-600 for all stats cells
          cellStyle = percentage > 0 ? {
            background: `linear-gradient(to top, ${color} ${percentage}%, rgba(15, 23, 42, 0.8) ${percentage}%)`
          } : undefined;

          cellClassName = cn(
            "font-medium border border-slate-800 flex items-center justify-center transition-colors select-none",
            "aspect-square w-full h-full",
            "text-[clamp(8px,1.5vw,14px)]", // Responsive text size
            isHovered && "ring-2 ring-white ring-inset",
            percentage > 0
              ? "text-white"
              : "bg-slate-900 text-slate-400"
          );
        } else {
          // Selection mode: original behavior
          cellClassName = cn(
            "font-medium border border-slate-800 flex items-center justify-center transition-colors select-none",
            "aspect-square w-full h-full",
            "text-[clamp(8px,1.5vw,14px)]", // Responsive text size
            isSelected
              ? type === "pair"
                ? "bg-emerald-600 text-white"
                : type === "suited"
                ? "bg-blue-600 text-white"
                : "bg-amber-600 text-white"
              : "bg-slate-900 text-slate-400 hover:bg-slate-800"
          );
        }

        // Always show the hand label
        const cellContent = handLabel;

        // Event handlers
        const handleMouseDown = () => {
          if (!readOnly && !isStatsMode) {
            onToggle(handLabel);
          }
        };

        const handleMouseEnterEvent = () => {
          if (isStatsMode && onCellHover) {
            onCellHover(handLabel);
          } else if (isMouseDown && onMouseEnter) {
            onMouseEnter(handLabel);
          }
        };

        const handleMouseLeave = () => {
          if (isStatsMode && onCellHover) {
            onCellHover(null);
          }
        };

        cells.push(
          <button
            key={handLabel}
            onMouseDown={handleMouseDown}
            onMouseEnter={handleMouseEnterEvent}
            onMouseLeave={handleMouseLeave}
            className={cellClassName}
            style={cellStyle}
            title={isStatsMode && cellData ? `${handLabel}: ${percentage.toFixed(1)}% (${cellData.sampleSize} hands)` : undefined}
          >
            {cellContent}
          </button>
        );
      }
    }

    return cells;
  }, [selectedHands, onToggle, isMouseDown, onMouseEnter, statsData, onCellHover, hoveredHand, readOnly, isStatsMode]);

  return (
    <div className={cn(
      "bg-white/5 p-1 rounded border border-slate-600",
      className
    )}>
      <div
        className="grid bg-slate-800 border-2 border-slate-400 p-1 select-none aspect-square"
        style={{
          gridTemplateColumns: "repeat(13, 1fr)",
          gridTemplateRows: "repeat(13, 1fr)",
          gap: "1px",
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
