"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { HandSelector } from "@/components/features/analysis/HandSelector";
import { BoardSelector } from "@/components/features/analysis/BoardSelector";
import { RangeGrid } from "@/components/features/analysis/RangeGrid";
// @ts-ignore - Importing from shared backend
import { calculateEquity } from "@backend/domain/evaluation/EquityCalculator";
// @ts-ignore - Importing from shared backend
import { parseRange } from "@backend/domain/evaluation/RangeParser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/hooks";

interface EquityResult {
  equities: number[];
  iterations: number;
}

interface Villain {
  id: number;
  type: "hand" | "range";
  hand: string[];
  range: Set<string>;
  rangeString: string;
  equity: number | null;
}

interface Preset {
  id: string;
  name: string;
  category: string;
  range_string: string;
}

export default function EquityCalculatorPage() {
  const isMobile = useIsMobile();
  // --- State ---
  const [board, setBoard] = useState<string[]>([]);
  const [heroHand, setHeroHand] = useState<string[]>(["", ""]);
  const [heroEquity, setHeroEquity] = useState<number | null>(null);

  // Villains (Start with 1)
  const [villains, setVillains] = useState<Villain[]>([
    {
      id: 1,
      type: "hand",
      hand: ["", ""],
      range: new Set(),
      rangeString: "",
      equity: null,
    },
  ]);

  const [presets, setPresets] = useState<Preset[]>([]);
  const [iterations, setIterations] = useState(0);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const calculationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const villainsRef = useRef<Villain[]>(villains);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Keep ref in sync with state
  useEffect(() => {
    villainsRef.current = villains;
  }, [villains]);

  // Handle horizontal scrolling with vertical wheel
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Handle wheel events for horizontal scrolling
    const handleWheel = (e: WheelEvent) => {
      // Only handle if there's horizontal overflow
      if (container.scrollWidth > container.clientWidth) {
        // Prevent default vertical scrolling
        e.preventDefault();
        // Convert vertical scroll to horizontal (slower - divide by 2)
        container.scrollLeft += e.deltaY / 2;
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [villains.length]);

  // Fetch Presets on Mount
  useEffect(() => {
    fetch("/api/ranges/presets")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setPresets(data);
      })
      .catch((err) => console.error("Failed to load presets", err));
  }, []);

  // --- Handlers ---

  const addVillain = () => {
    if (villains.length >= 5) return;
    const newId = Math.max(...villains.map((v) => v.id), 0) + 1;
    setVillains([
      ...villains,
      {
        id: newId,
        type: "hand",
        hand: ["", ""],
        range: new Set(),
        rangeString: "",
        equity: null,
      },
    ]);
  };

  const removeVillain = (id: number) => {
    setVillains(villains.filter((v) => v.id !== id));
  };

  const updateVillain = (id: number, updates: Partial<Villain>) => {
    setVillains(villains.map((v) => (v.id === id ? { ...v, ...updates } : v)));
  };

  // Range Logic for Villain 1
  const toggleRangeHand = (id: number, handLabel: string) => {
    const villain = villains.find((v) => v.id === id);
    if (!villain || villain.type !== "range") return;

    const nextRange = new Set(villain.range);
    if (nextRange.has(handLabel)) nextRange.delete(handLabel);
    else nextRange.add(handLabel);

    updateVillain(id, {
      range: nextRange,
      rangeString: Array.from(nextRange).join(","),
    });
  };

  const handleMouseEnter = (hand: string) => {
    if (isMouseDown) {
      const villain1 = villains.find((v) => v.id === 1);
      if (villain1 && villain1.type === "range") {
        toggleRangeHand(1, hand);
      }
    }
  };

  const loadPreset = (id: number, rangeStr: string) => {
    // 1. Expand range string to combos using backend parser
    const combos = parseRange(rangeStr);
    // 2. Map combos back to grid IDs
    const gridIds = new Set<string>();
    const RANKS = [
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
    for (const [c1, c2] of combos) {
      const r1 = c1[0];
      const r2 = c2[0];
      const s1 = c1[1];
      const s2 = c2[1];
      if (r1 === r2) gridIds.add(`${r1}${r1}`);
      else {
        const suited = s1 === s2 ? "s" : "o";
        if (RANKS.indexOf(r1) < RANKS.indexOf(r2))
          gridIds.add(`${r1}${r2}${suited}`);
        else gridIds.add(`${r2}${r1}${suited}`);
      }
    }
    updateVillain(id, { range: gridIds, rangeString: rangeStr });
  };

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

  // Create a stable key for calculation inputs (excluding equity)
  const calculationInputKey = useMemo(() => {
    return JSON.stringify({
      heroHand,
      board,
      villains: villains.map((v) => ({
        id: v.id,
        type: v.type,
        hand: v.hand,
        range: Array.from(v.range).sort(),
        rangeString: v.rangeString,
      })),
    });
  }, [
    heroHand.join(","),
    board.join(","),
    JSON.stringify(
      villains.map((v) => ({
        id: v.id,
        type: v.type,
        hand: v.hand.join(","),
        range: Array.from(v.range).sort().join(","),
        rangeString: v.rangeString,
      }))
    ),
  ]);

  // --- Auto-calculation with debounce ---
  useEffect(() => {
    // Clear any existing timeout
    if (calculationTimeoutRef.current) {
      clearTimeout(calculationTimeoutRef.current);
    }

    // Read current villains from ref (always up to date via sync effect)
    const currentVillains = villainsRef.current;
    const heroValid = !heroHand.some((c) => !c);
    const villain1 = currentVillains.find((v) => v.id === 1);
    const villain1HasHand =
      villain1 && villain1.type === "hand" && !villain1.hand.some((c) => !c);
    const villain1HasRange =
      villain1 && villain1.type === "range" && villain1.range.size > 0;
    const otherVillainsValid = currentVillains
      .filter((v) => v.id !== 1)
      .some((v) => !v.hand.some((c) => !c));

    // Valid if: (Hero + at least one other player) OR (Hero + Villain 1 with range)
    const isValid =
      heroValid &&
      (villain1HasHand ||
        otherVillainsValid || // At least 2 players total
        (heroValid && villain1HasRange)); // Hero + Villain 1 range

    if (!isValid) {
      // Clear equity values
      setHeroEquity(null);
      setIterations(0);
      // Only update villains if they have equity values to clear
      setVillains((prev) => {
        if (prev.some((v) => v.equity !== null)) {
          return prev.map((v) => ({ ...v, equity: null }));
        }
        return prev;
      });
      return;
    }

    // Debounce: wait 300ms after last change before calculating
    calculationTimeoutRef.current = setTimeout(() => {
      try {
        // Read current villains from ref at calculation time
        const villainsAtCalc = villainsRef.current;

        // Prepare inputs
        const inputs: (string[] | string)[] = [heroHand];
        const activeVillains = villainsAtCalc.filter(
          (v) =>
            (v.type === "hand" && !v.hand.some((c) => !c)) ||
            (v.type === "range" && v.range.size > 0)
        );

        activeVillains.forEach((v) => {
          if (v.type === "range") {
            inputs.push(v.rangeString || Array.from(v.range).join(","));
          } else {
            inputs.push(v.hand);
          }
        });

        // Run Calculator
        const result: EquityResult = calculateEquity(
          inputs,
          board.filter(Boolean),
          20000
        );

        // Update State
        setIterations(result.iterations);
        setHeroEquity(result.equities[0]);

        // Map results back to villains using functional update
        setVillains((prev) => {
          let resIdx = 1;
          return prev.map((v) => {
            if (
              (v.type === "hand" && !v.hand.some((c) => !c)) ||
              (v.type === "range" && v.range.size > 0)
            ) {
              return { ...v, equity: result.equities[resIdx++] };
            }
            return { ...v, equity: null };
          });
        });
      } catch (e) {
        console.error("Calculation error", e);
        setHeroEquity(null);
        setVillains((prev) => prev.map((v) => ({ ...v, equity: null })));
      }
    }, 300);

    // Cleanup timeout on unmount or dependency change
    return () => {
      if (calculationTimeoutRef.current) {
        clearTimeout(calculationTimeoutRef.current);
      }
    };
  }, [calculationInputKey]);

  const villain1 = villains.find((v) => v.id === 1);
  const isRangeMode = villain1?.type === "range";

  // Calculate all excluded cards (board + hero + all villains)
  const allExcludedCards = useMemo(() => {
    const excluded: string[] = [];
    excluded.push(...board.filter(Boolean));
    excluded.push(...heroHand.filter(Boolean));
    villains.forEach((v) => {
      if (v.type === "hand") {
        excluded.push(...v.hand.filter(Boolean));
      }
    });
    return excluded;
  }, [board, heroHand, villains]);

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
              {/* Mobile: Main Container Box - Single large box containing all sections */}
              <Card
                className="p-4 flex flex-col"
                style={{ minHeight: "calc(100vh - 8rem)" }}
              >
                {/* Mobile: Header */}
                <CardHeader className="pb-2 pt-0 px-0">
                  <CardTitle className="text-center text-xl font-bold">
                    Equity Evaluator
                  </CardTitle>
                </CardHeader>

                {/* Mobile: 1. Cards Box - Full Width (Table Cards, Hero, Villains) */}
                <div className="mb-4">
                  <div
                    ref={scrollContainerRef}
                    className="overflow-x-auto overflow-y-visible w-full pb-6"
                    style={{ scrollbarWidth: "none" }}
                  >
                    <div className="flex gap-4 items-center min-w-max">
                      {/* Table Cards */}
                      <div className="flex-shrink-0 space-y-1">
                        <div className="text-xs font-medium text-muted-foreground">
                          Table Cards
                        </div>
                        <BoardSelector
                          value={board}
                          onChange={setBoard}
                          excludedCards={allExcludedCards.filter(
                            (c) => !board.includes(c)
                          )}
                          showLabel={false}
                        />
                      </div>

                      {/* Hero */}
                      <div className="flex-shrink-0 space-y-1">
                        <div className="text-xs font-medium text-muted-foreground">
                          Hero
                        </div>
                        <HandSelector
                          value={heroHand}
                          onChange={setHeroHand}
                          excludedCards={allExcludedCards.filter(
                            (c) => !heroHand.includes(c)
                          )}
                        />
                      </div>

                      {/* Villains */}
                      {villains.map((villain, index) => (
                        <div
                          key={villain.id}
                          className="flex-shrink-0 space-y-1 relative"
                        >
                          <div className="text-xs font-medium text-muted-foreground">
                            Villain {index + 1}
                          </div>
                          {villains.length > 1 && villain.id !== 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute -top-2 right-0 h-5 w-5 text-muted-foreground hover:text-destructive"
                              onClick={() => removeVillain(villain.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                          {villain.type === "hand" ? (
                            <HandSelector
                              value={villain.hand}
                              onChange={(h) =>
                                updateVillain(villain.id, { hand: h })
                              }
                              excludedCards={allExcludedCards.filter(
                                (c) => !villain.hand.includes(c)
                              )}
                            />
                          ) : (
                            <div className="text-xs text-muted-foreground h-14 w-[5.5rem] flex items-center justify-center">
                              {villain.range.size} combos
                            </div>
                          )}
                          {/* Range toggle button for Villain 1 */}
                          {villain.id === 1 && (
                            <Button
                              variant={
                                villain.type === "range" ? "outline" : "default"
                              }
                              size="sm"
                              className="absolute top-[4rem] right-0 h-5 px-2 text-[10px] z-50"
                              onClick={() => {
                                if (villain.type === "hand") {
                                  updateVillain(1, {
                                    type: "range",
                                    hand: ["", ""],
                                  });
                                } else {
                                  updateVillain(1, {
                                    type: "hand",
                                  });
                                }
                              }}
                            >
                              {villain.type === "range"
                                ? "Use Hand"
                                : "Use Range"}
                            </Button>
                          )}
                        </div>
                      ))}

                      {/* Add Villain Button */}
                      {villains.length < 5 && (
                        <div className="flex-shrink-0 space-y-1">
                          <div className="h-5"></div>
                          <Button
                            variant="outline"
                            size="icon"
                            className="border-dashed h-14 w-10"
                            onClick={addVillain}
                          >
                            <Plus className="h-6 w-6" />
                          </Button>
                        </div>
                      )}
                    </div>
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
                        selectedHands={villain1?.range || new Set()}
                        onToggle={(h) => isRangeMode && toggleRangeHand(1, h)}
                        isMouseDown={isMouseDown && isRangeMode}
                        onMouseEnter={handleMouseEnter}
                      />
                    </div>
                  </div>
                  {/* Preset Dropdown and Clear Button - Side by side */}
                  {isRangeMode && (
                    <div className="flex gap-2 justify-center mt-2 px-4">
                      {presets.length > 0 && (
                        <div className="flex-1 max-w-[200px]">
                          <Select onValueChange={(val) => loadPreset(1, val)}>
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
                        onClick={() =>
                          updateVillain(1, {
                            range: new Set(),
                            rangeString: "",
                          })
                        }
                        variant="outline"
                        size="sm"
                        className="h-9 bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600"
                      >
                        Clear
                      </Button>
                    </div>
                  )}
                </div>

                {/* Mobile: 3. Results Box - Full Width */}
                <CardContent className="pt-3 pb-3 flex-1 flex flex-col">
                  {heroEquity !== null ? (
                    <div className="space-y-2">
                      <div className="pt-2">
                        <div className="text-xs font-semibold mb-1">Equity</div>
                        <div className="space-y-0.5">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-medium text-emerald-500">
                              Hero
                            </span>
                            <span className="text-muted-foreground">
                              {heroEquity.toFixed(1)}%
                            </span>
                          </div>
                          {villains.map(
                            (v, i) =>
                              v.equity !== null && (
                                <div
                                  key={v.id}
                                  className="flex justify-between items-center text-xs"
                                >
                                  <span className="font-medium">
                                    Villain {i + 1}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {v.equity.toFixed(1)}%
                                  </span>
                                </div>
                              )
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center pt-1">
                      Enter hands to calculate equity
                    </p>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              {/* Desktop: Main Container Box - Single large box containing all sections */}
              <Card className="p-6 flex flex-col">
                <div className="flex gap-6 flex-1 min-h-0 relative">
                  {/* LEFT SIDE: Horizontal scrollable row with Table Cards, Hero/Villains, and Range Grid */}
                  <div className="flex-1 flex flex-col min-w-0 max-w-full">
                    {/* Horizontal scrollable row: Table Cards | Hero | Villains | Add Button */}
                    <div
                      ref={scrollContainerRef}
                      className="pb-4 overflow-x-auto overflow-y-visible w-full relative"
                      style={{ scrollbarWidth: "none" }}
                    >
                      <div className="flex gap-4 items-center min-w-max">
                        {/* Table Cards */}
                        <div className="flex-shrink-0 ml-4 space-y-1">
                          <div className="text-xs font-medium text-muted-foreground">
                            Table Cards
                          </div>
                          <BoardSelector
                            value={board}
                            onChange={setBoard}
                            excludedCards={allExcludedCards.filter(
                              (c) => !board.includes(c)
                            )}
                            showLabel={false}
                          />
                        </div>

                        {/* Hero */}
                        <div className="flex-shrink-0 space-y-1">
                          <div className="text-xs font-medium text-muted-foreground">
                            Hero
                          </div>
                          <HandSelector
                            value={heroHand}
                            onChange={setHeroHand}
                            excludedCards={allExcludedCards.filter(
                              (c) => !heroHand.includes(c)
                            )}
                          />
                        </div>

                        {/* Villains */}
                        {villains.map((villain, index) => (
                          <div
                            key={villain.id}
                            className="flex-shrink-0 space-y-1 relative"
                          >
                            <div className="text-xs font-medium text-muted-foreground">
                              Villain {index + 1}
                            </div>
                            {villains.length > 1 && villain.id !== 1 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="absolute -top-2 right-0 h-5 w-5 text-muted-foreground hover:text-destructive"
                                onClick={() => removeVillain(villain.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                            {villain.type === "hand" ? (
                              <HandSelector
                                value={villain.hand}
                                onChange={(h) =>
                                  updateVillain(villain.id, { hand: h })
                                }
                                excludedCards={allExcludedCards.filter(
                                  (c) => !villain.hand.includes(c)
                                )}
                              />
                            ) : (
                              <div className="text-xs text-muted-foreground h-14 w-[5.5rem] flex items-center justify-center">
                                {villain.range.size} combos
                              </div>
                            )}
                            {/* Range toggle button for Villain 1 */}
                            {villain.id === 1 && (
                              <Button
                                variant={
                                  villain.type === "range"
                                    ? "outline"
                                    : "default"
                                }
                                size="sm"
                                className="absolute top-[4rem] right-0 h-5 px-2 text-[10px] z-50"
                                onClick={() => {
                                  if (villain.type === "hand") {
                                    // Switching to range mode - clear the hand
                                    updateVillain(1, {
                                      type: "range",
                                      hand: ["", ""],
                                    });
                                  } else {
                                    // Switching to hand mode
                                    updateVillain(1, {
                                      type: "hand",
                                    });
                                  }
                                }}
                              >
                                {villain.type === "range"
                                  ? "Use Hand"
                                  : "Use Range"}
                              </Button>
                            )}
                          </div>
                        ))}

                        {/* Add Villain Button - To the right of Villain 1 */}
                        {villains.length < 5 && (
                          <div className="flex-shrink-0 space-y-1">
                            <div className="h-5"></div>
                            <Button
                              variant="outline"
                              size="icon"
                              className="border-dashed h-14 w-10"
                              onClick={addVillain}
                            >
                              <Plus className="h-6 w-6" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Range Grid Box - Always displayed, beneath Villain 1 */}
                    <div className="flex-1 flex flex-col min-h-0 relative">
                      <div className="flex-1 flex items-center justify-center min-h-0 overflow-hidden">
                        <Card
                          className={cn(
                            "flex-shrink-0 max-h-full overflow-hidden",
                            !isRangeMode && "opacity-50"
                          )}
                        >
                          <CardContent className="pt-3 pb-3 overflow-auto max-h-full">
                            <div
                              ref={containerRef}
                              className="flex justify-start"
                            >
                              <div
                                className={cn(
                                  !isRangeMode && "pointer-events-none"
                                )}
                              >
                                <RangeGrid
                                  selectedHands={villain1?.range || new Set()}
                                  onToggle={(h) =>
                                    isRangeMode && toggleRangeHand(1, h)
                                  }
                                  isMouseDown={isMouseDown && isRangeMode}
                                  onMouseEnter={handleMouseEnter}
                                />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                      {/* Preset Dropdown - Bottom left */}
                      {presets.length > 0 && isRangeMode && (
                        <div className="absolute -bottom-2 left-0 z-10">
                          <div className="w-[180px]">
                            <Select onValueChange={(val) => loadPreset(1, val)}>
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
                      {isRangeMode && (
                        <div className="absolute -bottom-2 right-0 z-10">
                          <Button
                            onClick={() =>
                              updateVillain(1, {
                                range: new Set(),
                                rangeString: "",
                              })
                            }
                            variant="outline"
                            size="sm"
                            className="h-9 bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600"
                          >
                            Clear
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* RIGHT SIDE: Equity Results - Exact same styling as range evaluator */}
                  <div className="w-64 flex-shrink-0 flex flex-col">
                    <Card className="flex-1 flex flex-col min-h-0">
                      <CardHeader className="pb-1 pt-3">
                        <CardTitle className="text-center text-xl font-bold">
                          Equity Evaluator
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-3 pb-3 flex-1 flex flex-col">
                        {heroEquity !== null ? (
                          <div className="space-y-2">
                            <div className="pt-2">
                              <div className="text-xs font-semibold mb-1">
                                Equity
                              </div>
                              <div className="space-y-0.5">
                                <div className="flex justify-between items-center text-xs">
                                  <span className="font-medium text-emerald-500">
                                    Hero
                                  </span>
                                  <span className="text-muted-foreground">
                                    {heroEquity.toFixed(1)}%
                                  </span>
                                </div>
                                {villains.map(
                                  (v, i) =>
                                    v.equity !== null && (
                                      <div
                                        key={v.id}
                                        className="flex justify-between items-center text-xs"
                                      >
                                        <span className="font-medium">
                                          Villain {i + 1}
                                        </span>
                                        <span className="text-muted-foreground">
                                          {v.equity.toFixed(1)}%
                                        </span>
                                      </div>
                                    )
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground text-center pt-1">
                            Enter hands to calculate equity
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
