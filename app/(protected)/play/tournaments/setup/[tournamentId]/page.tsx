"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PlayLayout } from "@/components/layout/PlayLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useTournamentSocket,
  useTournamentEvents,
} from "@/lib/api/socket/tournament";
import { TournamentStateResponse } from "@/lib/types/tournament";
import { useToast } from "@/lib/hooks";
import { useTheme } from "@/components/providers/ThemeProvider";
import { createClientComponentClient } from "@/lib/api/supabase/client";
import {
  Loader2,
  ArrowLeft,
  Settings,
  Plus,
  Save,
  X,
  Users,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";

export default function TournamentSetupPage() {
  const params = useParams();
  const router = useRouter();
  const tournamentId = params.tournamentId as string;
  const {
    getTournamentState,
    updateTournamentSettings,
    tournamentAdminAction,
  } = useTournamentSocket();
  const { tournamentUpdate, statusChange } = useTournamentEvents(tournamentId);
  const { toast } = useToast();
  const { currentTheme } = useTheme();
  const supabase = createClientComponentClient();

  const [tournamentData, setTournamentData] =
    useState<TournamentStateResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Settings form state
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
  const [isOpeningRegistration, setIsOpeningRegistration] = useState(false);
  interface BlindLevel {
    small: number;
    big: number;
  }
  const [settingsForm, setSettingsForm] = useState<{
    maxPlayers: string;
    maxPlayersPerTable: string;
    startingStack: string;
    blindLevelDurationMinutes: string;
    blindStructure: BlindLevel[];
  }>({
    maxPlayers: "",
    maxPlayersPerTable: "9",
    startingStack: "10000",
    blindLevelDurationMinutes: "10",
    blindStructure: [
      { small: 10, big: 20 },
      { small: 20, big: 40 },
      { small: 50, big: 100 },
    ],
  });

  const primaryColor = currentTheme.colors.primary[0];
  const primaryColorHover = currentTheme.colors.primary[1] || primaryColor;

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setCurrentUserId(data.user.id);
      }
    });
  }, [supabase]);

  // Fetch tournament state
  useEffect(() => {
    const fetchTournamentState = async () => {
      if (!currentUserId) return;

      setIsLoading(true);
      try {
        const response = await getTournamentState(tournamentId);
        if ("error" in response) {
          toast({
            title: "Error",
            description: response.error,
            variant: "destructive",
          });
          router.push("/play");
          return;
        }

        // Extract status and hostId
        const status =
          typeof response.status === "string"
            ? response.status
            : (response as any).status?.status ||
              (response as any).tournament?.status;
        const hostId = response.hostId || (response as any).tournament?.host_id;

        // Check if user is host
        const isHost = hostId === currentUserId;
        if (!isHost) {
          // Not host - redirect to main tournament page
          router.replace(`/play/tournaments/${tournamentId}`);
          return;
        }

        // Check if status is still "setup"
        if (status !== "setup") {
          // Status changed - redirect to main tournament page
          router.replace(`/play/tournaments/${tournamentId}`);
          return;
        }

        setTournamentData(response as TournamentStateResponse);
        setIsLoading(false);
      } catch (error: any) {
        console.error("Failed to fetch tournament state", error);
        toast({
          title: "Error",
          description: "Failed to load tournament",
          variant: "destructive",
        });
        router.push("/play");
      } finally {
        setIsLoading(false);
      }
    };

    if (tournamentId && currentUserId) {
      fetchTournamentState();
    }
  }, [tournamentId, currentUserId, getTournamentState, router, toast]);

  // Update tournament data when real-time update arrives
  useEffect(() => {
    if (tournamentUpdate && tournamentData) {
      setTournamentData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tournament: tournamentUpdate,
        } as TournamentStateResponse;
      });
    }
  }, [tournamentUpdate, tournamentData]);

  // Handle status changes - redirect when status changes from setup to another state
  useEffect(() => {
    if (
      statusChange &&
      statusChange.tournamentId === tournamentId &&
      currentUserId
    ) {
      // Only redirect if status changed FROM setup TO a different state
      if (
        statusChange.previousStatus === "setup" &&
        statusChange.status !== "setup"
      ) {
        router.replace(`/play/tournaments/${tournamentId}`);
      } else {
        // Refresh tournament data
        getTournamentState(tournamentId).then((response) => {
          if (!("error" in response)) {
            setTournamentData(response as TournamentStateResponse);
          }
        });
      }
    }
  }, [statusChange, tournamentId, currentUserId, getTournamentState, router]);

  // Initialize settings form when tournament data loads
  useEffect(() => {
    if (tournamentData?.tournament) {
      const tournament = tournamentData.tournament;
      const status =
        typeof tournamentData.status === "string"
          ? tournamentData.status
          : (tournamentData as any).status?.status || tournament.status;

      if (status === "setup") {
        // Initialize form with existing values or defaults
        const blindStructureTemplate =
          tournament.blind_structure_template ||
          tournament.blindStructureTemplate ||
          [];
        const existingBlindStructure =
          blindStructureTemplate.length > 0
            ? blindStructureTemplate.map((level: any) => ({
                small: level.small,
                big: level.big,
              }))
            : [
                { small: 10, big: 20 },
                { small: 20, big: 40 },
                { small: 50, big: 100 },
              ];

        setSettingsForm({
          maxPlayers:
            tournament.max_players?.toString() ||
            tournament.maxPlayers?.toString() ||
            "",
          maxPlayersPerTable:
            tournament.max_players_per_table?.toString() ||
            tournament.maxPlayersPerTable?.toString() ||
            tournament.config?.maxPlayersPerTable?.toString() ||
            "9",
          startingStack:
            tournament.starting_stack?.toString() ||
            tournament.startingStack?.toString() ||
            tournament.config?.startingStack?.toString() ||
            "10000",
          blindLevelDurationMinutes:
            tournament.blind_level_duration_minutes?.toString() ||
            tournament.blindLevelDurationMinutes?.toString() ||
            "10",
          blindStructure: existingBlindStructure,
        });
      }
    }
  }, [tournamentData]);

  // Helper functions for blind structure
  const addBlindLevel = () => {
    const lastLevel =
      settingsForm.blindStructure[settingsForm.blindStructure.length - 1];
    const newSmall = lastLevel.big;
    const newBig = lastLevel.big * 2;
    setSettingsForm({
      ...settingsForm,
      blindStructure: [
        ...settingsForm.blindStructure,
        { small: newSmall, big: newBig },
      ],
    });
  };

  const removeBlindLevel = (index: number) => {
    if (settingsForm.blindStructure.length > 1) {
      setSettingsForm({
        ...settingsForm,
        blindStructure: settingsForm.blindStructure.filter(
          (_, i) => i !== index
        ),
      });
    }
  };

  const updateBlindLevel = (
    index: number,
    type: "small" | "big",
    value: number
  ) => {
    const updated = [...settingsForm.blindStructure];
    updated[index] = { ...updated[index], [type]: value };
    setSettingsForm({ ...settingsForm, blindStructure: updated });
  };

  const handleUpdateSettings = async () => {
    // Validation
    if (
      !settingsForm.maxPlayersPerTable ||
      parseInt(settingsForm.maxPlayersPerTable) < 2 ||
      parseInt(settingsForm.maxPlayersPerTable) > 10
    ) {
      toast({
        title: "Validation Error",
        description: "Players per table must be between 2 and 10",
        variant: "destructive",
      });
      return;
    }

    if (
      !settingsForm.startingStack ||
      parseInt(settingsForm.startingStack) <= 0
    ) {
      toast({
        title: "Validation Error",
        description: "Starting stack must be greater than 0",
        variant: "destructive",
      });
      return;
    }

    if (
      !settingsForm.blindLevelDurationMinutes ||
      parseInt(settingsForm.blindLevelDurationMinutes) <= 0
    ) {
      toast({
        title: "Validation Error",
        description: "Blind level duration must be greater than 0",
        variant: "destructive",
      });
      return;
    }

    if (settingsForm.blindStructure.length === 0) {
      toast({
        title: "Validation Error",
        description: "At least one blind level is required",
        variant: "destructive",
      });
      return;
    }

    // Validate blind structure
    for (let i = 0; i < settingsForm.blindStructure.length; i++) {
      const level = settingsForm.blindStructure[i];
      if (level.small <= 0 || level.big <= 0 || level.big <= level.small) {
        toast({
          title: "Validation Error",
          description: `Blind level ${i}: Big blind must be greater than small blind, and both must be positive`,
          variant: "destructive",
        });
        return;
      }
    }

    setIsUpdatingSettings(true);

    try {
      // Build settings payload
      const settings: any = {
        maxPlayersPerTable: parseInt(settingsForm.maxPlayersPerTable),
        startingStack: parseInt(settingsForm.startingStack),
        blindLevelDurationMinutes: parseInt(
          settingsForm.blindLevelDurationMinutes
        ),
        blindStructureTemplate: settingsForm.blindStructure,
      };

      if (settingsForm.maxPlayers && settingsForm.maxPlayers.trim()) {
        const maxPlayersNum = parseInt(settingsForm.maxPlayers);
        if (!isNaN(maxPlayersNum) && maxPlayersNum > 0) {
          settings.maxPlayers = maxPlayersNum;
        }
      }

      const response = await updateTournamentSettings(tournamentId, settings);

      if ("error" in response) {
        toast({
          title: "Error Updating Settings",
          description: response.error || "Failed to update tournament settings",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Settings Updated",
        description: "Tournament settings have been saved successfully",
        variant: "default",
      });

      // Refresh tournament data
      const updatedResponse = await getTournamentState(tournamentId);
      if (!("error" in updatedResponse)) {
        setTournamentData(updatedResponse as TournamentStateResponse);
      }
    } catch (error: any) {
      console.error("[Tournament] Failed to update settings:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update tournament settings",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const handleOpenRegistration = async () => {
    setIsOpeningRegistration(true);

    try {
      const response = await tournamentAdminAction(
        tournamentId,
        "OPEN_REGISTRATION"
      );

      if ("error" in response) {
        toast({
          title: "Error Opening Registration",
          description:
            response.error || "Failed to open tournament registration",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Registration Opened",
        description:
          "Tournament registration is now open. Players can now join.",
        variant: "default",
      });

      // Redirect to main tournament page after opening registration
      router.replace(`/play/tournaments/${tournamentId}`);
    } catch (error: any) {
      console.error("[Tournament] Failed to open registration:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to open tournament registration",
        variant: "destructive",
      });
    } finally {
      setIsOpeningRegistration(false);
    }
  };

  if (isLoading || !tournamentData) {
    return (
      <PlayLayout title="Tournament Setup">
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      </PlayLayout>
    );
  }

  const tournament = tournamentData.tournament;
  const hostId = tournamentData.hostId || tournament.host_id;
  const isHost = currentUserId ? hostId === currentUserId : false;
  const status =
    typeof tournamentData.status === "string"
      ? tournamentData.status
      : (tournamentData as any).status?.status || tournament.status;

  // Don't render if not host (redirect is handled in useEffect above)
  if (!isHost) {
    return (
      <PlayLayout title="Tournament Setup">
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      </PlayLayout>
    );
  }

  return (
    <PlayLayout
      title={`Setup: ${tournament.title || tournament.name || "Tournament"}`}
      footer={
        <div className="flex gap-2">
          <Button
            onClick={handleUpdateSettings}
            disabled={isUpdatingSettings || isOpeningRegistration}
            size="lg"
            variant="secondary"
            className="flex-1 font-bold text-lg h-14"
          >
            {isUpdatingSettings ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Save className="mr-2 h-5 w-5" />
            )}
            Save Settings
          </Button>
          {status === "setup" && (
            <Button
              onClick={handleOpenRegistration}
              disabled={isUpdatingSettings || isOpeningRegistration}
              size="lg"
              className="flex-1 font-bold text-lg h-14"
              style={{
                background: `linear-gradient(to right, ${primaryColor}, ${primaryColorHover})`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `linear-gradient(to right, ${primaryColorHover}, ${primaryColor})`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = `linear-gradient(to right, ${primaryColor}, ${primaryColorHover})`;
              }}
            >
              {isOpeningRegistration ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Users className="mr-2 h-5 w-5" />
              )}
              Open Registration
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        <Link
          href={`/play/tournaments/${tournamentId}`}
          className="inline-flex items-center text-sm text-slate-500 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Tournament
        </Link>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Settings className="h-5 w-5 text-slate-400" />
              Configure Tournament Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-400">
              Configure your tournament settings before opening registration.
              All fields marked with * are required.
            </p>

            <Separator className="bg-slate-700" />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Max Players (Optional)</Label>
                <Input
                  type="number"
                  value={settingsForm.maxPlayers}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      maxPlayers: e.target.value,
                    })
                  }
                  className="bg-slate-900 border-slate-800 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                  min="1"
                  placeholder="Unlimited"
                />
                <p className="text-xs text-slate-500">
                  Leave empty for unlimited players. Tables will be created
                  automatically.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Players Per Table *</Label>
                <Input
                  type="number"
                  value={settingsForm.maxPlayersPerTable}
                  onChange={(e) => {
                    const value = e.target.value;
                    const num = parseInt(value);
                    if (!isNaN(num) && num >= 2 && num <= 10) {
                      setSettingsForm({
                        ...settingsForm,
                        maxPlayersPerTable: value,
                      });
                    } else if (value === "") {
                      setSettingsForm({
                        ...settingsForm,
                        maxPlayersPerTable: "",
                      });
                    }
                  }}
                  className="bg-slate-900 border-slate-800 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                  min="2"
                  max="10"
                />
                <p className="text-xs text-slate-500">
                  Must be between 2 and 10
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Starting Stack *</Label>
                <Input
                  type="number"
                  value={settingsForm.startingStack}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      startingStack: e.target.value,
                    })
                  }
                  className="bg-slate-900 border-slate-800 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                  min="1"
                />
              </div>
              <div className="space-y-2">
                <Label>Blind Level Duration (minutes) *</Label>
                <Input
                  type="number"
                  value={settingsForm.blindLevelDurationMinutes}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      blindLevelDurationMinutes: e.target.value,
                    })
                  }
                  className="bg-slate-900 border-slate-800 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                  min="1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Blind Structure *</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addBlindLevel}
                  className="h-8"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Level
                </Button>
              </div>
              <div className="space-y-2">
                {settingsForm.blindStructure.map((level, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 p-3 bg-slate-900/50 border border-slate-700 rounded-lg"
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs text-slate-500 w-12">
                        Level {index + 1}
                      </span>
                      <div className="flex items-center gap-2 flex-1">
                        <div className="flex-1">
                          <Label className="text-xs text-slate-500">
                            Small Blind
                          </Label>
                          <Input
                            type="number"
                            value={level.small}
                            onChange={(e) => {
                              const value = parseInt(e.target.value);
                              if (!isNaN(value) && value > 0) {
                                updateBlindLevel(index, "small", value);
                              }
                            }}
                            className="bg-slate-800 border-slate-700 h-8 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                            min="1"
                          />
                        </div>
                        <span className="text-slate-500 pt-5">/</span>
                        <div className="flex-1">
                          <Label className="text-xs text-slate-500">
                            Big Blind
                          </Label>
                          <Input
                            type="number"
                            value={level.big}
                            onChange={(e) => {
                              const value = parseInt(e.target.value);
                              if (!isNaN(value) && value > 0) {
                                updateBlindLevel(index, "big", value);
                              }
                            }}
                            className="bg-slate-800 border-slate-700 h-8 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                            min="1"
                          />
                        </div>
                      </div>
                    </div>
                    {settingsForm.blindStructure.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeBlindLevel(index)}
                        className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                Define the blind levels for your tournament. Blinds will
                increase automatically based on the duration you set.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </PlayLayout>
  );
}
