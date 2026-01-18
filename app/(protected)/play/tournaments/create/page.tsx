"use client";

import React, { useState } from "react";
import { PlayLayout } from "@/components/layout/PlayLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useTournamentSocket } from "@/lib/api/socket/tournament";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, Trophy } from "lucide-react";
import Link from "next/link";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useToast } from "@/lib/hooks";

export default function CreateTournamentPage() {
  const { createTournament } = useTournamentSocket();
  const router = useRouter();
  const { currentTheme } = useTheme();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  
  // Form State - Only title and description required for creation
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // Get theme colors for button
  const primaryColor = currentTheme.colors.primary[0];
  const primaryColorHover = currentTheme.colors.primary[1] || primaryColor;

  const handleCreateTournament = async () => {
    // Validation - Only title is required
    if (!title.trim()) {
      toast({
        title: "Validation Error",
        description: "Tournament title is required",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const payload: any = {
        title: title.trim(),
      };

      if (description.trim()) {
        payload.description = description.trim();
      }

      const response = await createTournament(payload);

      if ("error" in response) {
        toast({
          title: "Error Creating Tournament",
          description: response.error,
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      if (response.tournamentId) {
        toast({
          title: "Tournament Created",
          description: "Configure your tournament settings before opening registration",
          variant: "default",
        });
        router.push(`/play/tournaments/setup/${response.tournamentId}`);
      } else {
        toast({
          title: "Error Creating Tournament",
          description: "Failed to create tournament",
          variant: "destructive",
        });
        setIsLoading(false);
      }
    } catch (error: any) {
      console.error("Failed to create tournament", error);
      toast({
        title: "Error Creating Tournament",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  return (
    <PlayLayout 
      title="Create Tournament"
      footer={
        <Button
          size="lg"
          className="w-full font-bold text-sm h-12"
          style={{
            background: `linear-gradient(to right, ${primaryColor}, ${primaryColorHover})`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = `linear-gradient(to right, ${primaryColorHover}, ${primaryColor})`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = `linear-gradient(to right, ${primaryColor}, ${primaryColorHover})`;
          }}
          onClick={handleCreateTournament}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Trophy className="mr-2 h-4 w-4" />
          )}
          Create Tournament
        </Button>
      }
    >
      <div className="space-y-3">
        <Link href="/play" className="inline-flex items-center text-xs text-slate-500 hover:text-white">
          <ArrowLeft className="h-3 w-3 mr-1" /> Back
        </Link>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-3 flex items-start gap-2">
            <div className="p-1.5 bg-slate-800/50 rounded-lg flex-shrink-0">
              <Trophy className="h-4 w-4 text-slate-400" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-slate-300">Create Tournament</h3>
              <p className="text-xs text-slate-400 mt-1">
                Start by creating your tournament with a title. You'll configure the settings (blinds, players, etc.) after creation.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Tournament Title *</Label>
            <Input 
              type="text" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter tournament title"
              className="bg-slate-900 border-slate-800 h-9 text-sm"
              maxLength={100}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Description (Optional)</Label>
            <Input 
              type="text" 
              value={description} 
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter tournament description"
              className="bg-slate-900 border-slate-800 h-9 text-sm"
              maxLength={500}
            />
          </div>

          <div className="p-3 bg-slate-800/30 border border-slate-700 rounded-lg">
            <p className="text-xs text-slate-400">
              <strong className="text-slate-300">Next Steps:</strong> After creating the tournament, you'll be able to configure:
            </p>
            <ul className="mt-1.5 text-xs text-slate-400 list-disc list-inside space-y-0.5">
              <li>Starting stack and blind structure</li>
              <li>Maximum players and players per table</li>
              <li>Blind level duration</li>
            </ul>
            <p className="mt-1.5 text-xs text-slate-400">
              Once settings are configured, you can open registration for players to join.
            </p>
          </div>
        </div>
      </div>
    </PlayLayout>
  );
}
