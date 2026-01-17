"use client";

import React, { useState } from "react";
import { PlayLayout } from "@/components/layout/PlayLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useSocket } from "@/lib/api/socket/client";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, Crown } from "lucide-react";
import Link from "next/link";
import { useTheme } from "@/components/providers/ThemeProvider";

export default function HostGamePage() {
  const socket = useSocket();
  const router = useRouter();
  const { currentTheme } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  
  // Form State
  const [variant, setVariant] = useState("six_max");
  const [buyIn, setBuyIn] = useState("200");
  const [smallBlind, setSmallBlind] = useState("1");
  const [bigBlind, setBigBlind] = useState("2");

  // Get theme colors for button
  const primaryColor = currentTheme.colors.primary[0];
  const primaryColorHover = currentTheme.colors.primary[1] || primaryColor;

  const handleCreateGame = () => {
    setIsLoading(true);
    
    if (!socket.connected) socket.connect();

    socket.emit("create_private_game", {
      variantSlug: variant,
      config: {
        buyIn: parseInt(buyIn),
        startingStack: parseInt(buyIn),
        blinds: { small: parseInt(smallBlind), big: parseInt(bigBlind) }
      }
    }, (response: any) => {
      if (response?.gameId) {
        router.push(`/play/private/${response.gameId}`);
      } else {
        setIsLoading(false);
        console.error("Failed to create game", response);
      }
    });
  };

  return (
    <PlayLayout 
      title="Host Private Game"
      footer={
        <Button
          size="lg"
          className="w-full font-bold text-lg h-14"
          style={{
            background: `linear-gradient(to right, ${primaryColor}, ${primaryColorHover})`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = `linear-gradient(to right, ${primaryColorHover}, ${primaryColor})`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = `linear-gradient(to right, ${primaryColor}, ${primaryColorHover})`;
          }}
          onClick={handleCreateGame}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <Crown className="mr-2 h-5 w-5" />
          )}
          Create Lobby
        </Button>
      }
    >
      <div className="space-y-6">
        <Link href="/play" className="inline-flex items-center text-sm text-slate-500 hover:text-white">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Modes
        </Link>

        <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-xl flex items-start gap-4">
          <div className="p-2 bg-slate-800/50 rounded-lg">
            <Crown className="h-6 w-6 text-slate-400" />
          </div>
          <div>
            <h3 className="font-bold text-slate-300">You are the Host</h3>
            <p className="text-sm text-slate-400">You will have full control over the game state, including pausing, editing stacks, and managing players.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Table Size</Label>
            <Select value={variant} onValueChange={setVariant}>
              <SelectTrigger className="bg-slate-900 border-slate-800">
                <SelectValue placeholder="Select size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="heads_up">Heads Up (2 Max)</SelectItem>
                <SelectItem value="six_max">6-Max</SelectItem>
                <SelectItem value="ten_max">Full Ring (10 Max)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Starting Stack</Label>
              <Input 
                type="number" 
                value={buyIn} 
                onChange={(e) => setBuyIn(e.target.value)} 
                className="bg-slate-900 border-slate-800 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
              />
            </div>
            <div className="space-y-2">
              <Label>SB / BB</Label>
              <div className="flex gap-2 items-center">
                <Input 
                  type="number" 
                  value={smallBlind} 
                  onChange={(e) => setSmallBlind(e.target.value)} 
                  className="bg-slate-900 border-slate-800 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                />
                <span className="text-slate-500">/</span>
                <Input 
                  type="number" 
                  value={bigBlind} 
                  onChange={(e) => setBigBlind(e.target.value)} 
                  className="bg-slate-900 border-slate-800 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </PlayLayout>
  );
}

