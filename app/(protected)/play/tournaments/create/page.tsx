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
          onClick={handleCreateTournament}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <Trophy className="mr-2 h-5 w-5" />
          )}
          Create Tournament
        </Button>
      }
    >
      <div className="space-y-6">
        <Link href="/play" className="inline-flex items-center text-sm text-slate-500 hover:text-white">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Modes
        </Link>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4 flex items-start gap-4">
            <div className="p-2 bg-slate-800/50 rounded-lg">
              <Trophy className="h-6 w-6 text-slate-400" />
            </div>
            <div>
              <h3 className="font-bold text-slate-300">Create Tournament</h3>
              <p className="text-sm text-slate-400">
                Start by creating your tournament with a title. You'll configure the settings (blinds, players, etc.) after creation.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tournament Title *</Label>
            <Input 
              type="text" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter tournament title"
              className="bg-slate-900 border-slate-800"
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label>Description (Optional)</Label>
            <Input 
              type="text" 
              value={description} 
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter tournament description"
              className="bg-slate-900 border-slate-800"
              maxLength={500}
            />
          </div>

          <div className="p-4 bg-slate-800/30 border border-slate-700 rounded-lg">
            <p className="text-sm text-slate-400">
              <strong className="text-slate-300">Next Steps:</strong> After creating the tournament, you'll be able to configure:
            </p>
            <ul className="mt-2 text-sm text-slate-400 list-disc list-inside space-y-1">
              <li>Starting stack and blind structure</li>
              <li>Maximum players and players per table</li>
              <li>Blind level duration</li>
            </ul>
            <p className="mt-2 text-sm text-slate-400">
              Once settings are configured, you can open registration for players to join.
            </p>
          </div>
        </div>
      </div>
    </PlayLayout>
  );
}
