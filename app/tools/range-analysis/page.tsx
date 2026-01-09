"use client";

import React, { useState, useEffect, useRef } from "react";
import { RangeGrid } from "@/components/analysis/RangeGrid";
import { BoardSelector } from "@/components/analysis/BoardSelector";
// @ts-ignore - Importing from shared backend
import { analyzeRange } from "@backend/domain/evaluation/RangeAnalyzer";
// @ts-ignore - Importing from shared backend
import { parseRange } from "@backend/domain/evaluation/RangeParser";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/lib/hooks";
import { cn } from "@/lib/utils";

interface Preset {
  id: string;
  name: string;
  category: string;
  range_string: string;
}

interface RangeAnalysisResult {
  totalCombos: number;
  validCombos: number;
  stats: Array<{
    type: string;
    count: number;
    percentage: number;
  }>;
}

export default function RangeAnalysisPage() {
  const isMobile = useIsMobile();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedHands, setSelectedHands] = useState<Set<string>>(new Set());
  const [boardCards, setBoardCards] = useState<string[]>([]);
  const [result, setResult] = useState<RangeAnalysisResult | null>(null);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch Presets on Mount
  useEffect(() => {
    fetch("/api/ranges/presets")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setPresets(data);
      })
      .catch((err) => console.error("Failed to load presets", err));
  }, []);

  // Handlers
  const toggleHand = (hand: string) => {
    const next = new Set(selectedHands);
    if (next.has(hand)) next.delete(hand);
    else next.add(hand);
    setSelectedHands(next);
  };

  const handleMouseEnter = (hand: string) => {
    if (isMouseDown) {
      toggleHand(hand);
    }
  };

  // Convert card array (e.g., ["Ah", "Kd"]) to grid format (e.g., "AKo")
  const cardsToGridFormat = (cards: string[]): string => {
    if (cards.length !== 2) return "";

    const rank1 = cards[0][0];
    const suit1 = cards[0][1];
    const rank2 = cards[1][0];
    const suit2 = cards[1][1];

    // Ranks in order (A, K, Q, J, T, 9, 8, 7, 6, 5, 4, 3, 2)
    const rankOrder = [
      "A",
      "K",
      "Q",
      "J",
      "T",
      "9",
      "8",
      "7",
      "6",
      "5",
      "4",
      "3",
      "2",
    ];
    const rank1Idx = rankOrder.indexOf(rank1);
    const rank2Idx = rankOrder.indexOf(rank2);

    if (rank1Idx === -1 || rank2Idx === -1) return "";

    // Pair
    if (rank1 === rank2) {
      return `${rank1}${rank1}`;
    }

    // Determine higher and lower rank
    const higherRank = rank1Idx < rank2Idx ? rank1 : rank2;
    const lowerRank = rank1Idx < rank2Idx ? rank2 : rank1;
    const higherSuit = rank1Idx < rank2Idx ? suit1 : suit2;
    const lowerSuit = rank1Idx < rank2Idx ? suit2 : suit1;

    // Suited or offsuit
    if (higherSuit === lowerSuit) {
      return `${higherRank}${lowerRank}s`;
    } else {
      return `${higherRank}${lowerRank}o`;
    }
  };

  const loadPreset = (rangeStr: string) => {
    try {
      // Use RangeParser to expand the range (handles "QQ+", "AKs-A9s", etc.)
      const combos = parseRange(rangeStr);

      // Convert card arrays to grid format strings
      const gridHands = combos.map(cardsToGridFormat).filter(Boolean);

      // Remove duplicates and set
      setSelectedHands(new Set(gridHands));
    } catch (error) {
      console.error("Error parsing range:", error);
      // Fallback to simple comma split if parsing fails
      const hands = rangeStr
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      setSelectedHands(new Set(hands));
    }
  };

  // Auto-analyze with debounce when range or board changes
  useEffect(() => {
    const rangeArray = Array.from(selectedHands);
    const board = boardCards;

    // Log the hands included in the range
    console.log("Hands in range:", rangeArray.sort());

    // Only analyze if valid: 3+ table cards and range is not empty
    if (board.length < 3 || rangeArray.length === 0) {
      setResult(null);
      return;
    }

    // Debounce: wait 300ms after last change before analyzing
    const timeoutId = setTimeout(() => {
      try {
        const analysis = analyzeRange(rangeArray.join(","), board);
        setResult(analysis);
      } catch (error) {
        console.error("Error analyzing range:", error);
        setResult(null);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [selectedHands, boardCards]);

  // Handle mouse up/down for drag selection
  useEffect(() => {
    const handleMouseUp = () => setIsMouseDown(false);
    const handleMouseDown = () => setIsMouseDown(true);

    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousedown", handleMouseDown);

    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, []);

  return (
    <div className="min-h-screen relative">
      {/* Content Layer - Above Background */}
      <div className="relative z-10 flex items-center min-h-screen">
        <div
          className={cn(
            "container mx-auto pt-6 pb-2 max-w-4xl w-full",
            isMobile ? "px-4" : "px-6"
          )}
        >
          {isMobile ? (
            <>
              {/* Mobile: Main Container Box - Single large box containing all three sections */}
              <Card
                className="p-4 flex flex-col"
                style={{ minHeight: "calc(100vh - 8rem)" }}
              >
                {/* Mobile: Header */}
                <CardHeader className="pb-2 pt-0 px-0">
                  <CardTitle className="text-center text-xl font-bold">
                    Range Evaluator
                  </CardTitle>
                </CardHeader>

                {/* Mobile: 1. Cards Box - Full Width */}
                <div className="mb-4">
                  <div className="mx-auto">
                    <BoardSelector
                      value={boardCards}
                      onChange={setBoardCards}
                    />
                  </div>
                </div>

                {/* Mobile: 2. Range Box - Inside main card, no extra sub-box */}
                <div className="w-full mb-4">
                  <div className="w-full overflow-auto flex justify-center">
                    <div
                      ref={containerRef}
                      style={{
                        aspectRatio: "1",
                        maxWidth: "100vw",
                        width: "100%",
                      }}
                    >
                      <RangeGrid
                        selectedHands={selectedHands}
                        onToggle={toggleHand}
                        isMouseDown={isMouseDown}
                        onMouseEnter={handleMouseEnter}
                      />
                    </div>
                  </div>
                  {/* Preset Dropdown and Clear Button - Side by side */}
                  <div className="flex gap-2 justify-center mt-2 px-4">
                    {presets.length > 0 && (
                      <div className="flex-1 max-w-[200px]">
                        <Select onValueChange={loadPreset}>
                          <SelectTrigger className="w-full h-9">
                            <SelectValue placeholder="Select Range Preset" />
                          </SelectTrigger>
                          <SelectContent>
                            {presets.map((preset) => (
                              <SelectItem
                                key={preset.id}
                                value={preset.range_string}
                              >
                                {preset.name} ({preset.category})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <Button
                      onClick={() => setSelectedHands(new Set())}
                      variant="outline"
                      size="sm"
                      className="h-9 bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600"
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                {/* Mobile: 3. Results Box - Full Width */}
                <CardContent className="pt-3 pb-3 flex-1 flex flex-col">
                  {result ? (
                    <div className="space-y-2">
                      <div>
                        <div className="text-xs text-muted-foreground">
                          Total Valid Combos
                        </div>
                        <div className="text-xl font-bold">
                          {result.validCombos}
                        </div>
                      </div>

                      <div className="pt-2 border-t">
                        <div className="text-xs font-semibold mb-1">
                          Hand Type Distribution
                        </div>
                        {result.stats.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            No hand types found
                          </p>
                        ) : (
                          <div className="space-y-0.5">
                            {result.stats.map((stat) => (
                              <div
                                key={stat.type}
                                className="flex justify-between items-center text-xs"
                              >
                                <span className="font-medium">{stat.type}</span>
                                <span className="text-muted-foreground">
                                  {stat.percentage.toFixed(1)}%
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center pt-1">
                      {selectedHands.size === 0 || boardCards.length < 3
                        ? "Select hands and 3+ table cards to see results"
                        : "Analyzing..."}
                    </p>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              {/* Desktop: Main Container Box - Single large box containing all three sections */}
              <Card className="p-6 flex flex-col">
                <div className="flex gap-6 flex-1 min-h-0 relative">
                  {/* Desktop: LEFT SIDE (Cards + Range) */}
                  <div className="flex-1 flex flex-col min-w-0">
                    {/* Table Cards - Inside parent box, no own box */}
                    <div className="mb-4 ml-4">
                      <BoardSelector
                        value={boardCards}
                        onChange={setBoardCards}
                      />
                    </div>

                    {/* Range Grid Box */}
                    <div className="flex-1 flex flex-col min-h-0 relative">
                      <div className="flex-1 flex items-center justify-center min-h-0 overflow-hidden">
                        <Card className="flex-shrink-0 max-h-full overflow-hidden">
                          <CardContent className="pt-3 pb-3 overflow-auto max-h-full">
                            <div
                              ref={containerRef}
                              className="flex justify-start"
                            >
                              <RangeGrid
                                selectedHands={selectedHands}
                                onToggle={toggleHand}
                                isMouseDown={isMouseDown}
                                onMouseEnter={handleMouseEnter}
                              />
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                      {/* Preset Dropdown - Outside range box, bottom left */}
                      {presets.length > 0 && (
                        <div className="absolute -bottom-2 left-0 z-10">
                          <div className="w-[180px]">
                            <Select onValueChange={loadPreset}>
                              <SelectTrigger className="w-full h-9">
                                <SelectValue placeholder="Select Range Preset" />
                              </SelectTrigger>
                              <SelectContent>
                                {presets.map((preset) => (
                                  <SelectItem
                                    key={preset.id}
                                    value={preset.range_string}
                                  >
                                    {preset.name} ({preset.category})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                      {/* Clear Range Button - Bottom right */}
                      <div className="absolute -bottom-2 right-0 z-10">
                        <Button
                          onClick={() => setSelectedHands(new Set())}
                          variant="outline"
                          size="sm"
                          className="h-9 bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600"
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Desktop: RIGHT SIDE: Analysis Results */}
                  <div className="w-64 flex-shrink-0 flex flex-col">
                    <Card className="flex-1 flex flex-col min-h-0">
                      <CardHeader className="pb-1 pt-3">
                        <CardTitle className="text-center text-xl font-bold">
                          Range Evaluator
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-3 pb-3 flex-1 flex flex-col">
                        {result ? (
                          <div className="space-y-2">
                            <div>
                              <div className="text-xs text-muted-foreground">
                                Total Valid Combos
                              </div>
                              <div className="text-xl font-bold">
                                {result.validCombos}
                              </div>
                            </div>

                            <div className="pt-2 border-t">
                              <div className="text-xs font-semibold mb-1">
                                Hand Type Distribution
                              </div>
                              {result.stats.length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                  No hand types found
                                </p>
                              ) : (
                                <div className="space-y-0.5">
                                  {result.stats.map((stat) => (
                                    <div
                                      key={stat.type}
                                      className="flex justify-between items-center text-xs"
                                    >
                                      <span className="font-medium">
                                        {stat.type}
                                      </span>
                                      <span className="text-muted-foreground">
                                        {stat.percentage.toFixed(1)}%
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground text-center pt-1">
                            {selectedHands.size === 0 || boardCards.length < 3
                              ? "Select hands and 3+ table cards to see results"
                              : "Analyzing..."}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
