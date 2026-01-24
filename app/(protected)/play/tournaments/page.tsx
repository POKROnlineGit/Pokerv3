"use client";

import React, { useState } from "react";
import { PlayLayout } from "@/components/layout/PlayLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTournamentSocket } from "@/lib/api/socket/tournament";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, Trophy } from "lucide-react";
import Link from "next/link";
import { useTheme } from "@/components/providers/PreferencesProvider";
import { useToast } from "@/lib/hooks";
import { getErrorMessage } from "@/lib/utils";

export default function CreateTournamentPage() {
  const { createTournament } = useTournamentSocket();
  const router = useRouter();
  const { currentTheme } = useTheme();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // Form State - Only title required for creation
  const [title, setTitle] = useState("");

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
      const response = await createTournament({ title: title.trim() });

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
    } catch (error: unknown) {
      console.error("Failed to create tournament", error);
      toast({
        title: "Error Creating Tournament",
        description: getErrorMessage(error),
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
            background: 'linear-gradient(to right, var(--theme-primary-0), var(--theme-primary-1))',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'linear-gradient(to right, var(--theme-primary-1), var(--theme-primary-0))';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'linear-gradient(to right, var(--theme-primary-0), var(--theme-primary-1))';
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
        <Link href="/play" className="inline-flex items-center text-sm text-slate-500 hover:text-white">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Modes
        </Link>

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
