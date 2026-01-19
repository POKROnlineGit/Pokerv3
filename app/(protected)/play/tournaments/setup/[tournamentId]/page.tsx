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
import { TournamentStateResponse, normalizeTournament, BlindLevel, getStatusString } from "@/lib/types/tournament";
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
import { getErrorMessage } from "@/lib/utils";

export default function TournamentSetupPage() {
  const params = useParams();
  const router = useRouter();
  const tournamentId = params.tournamentId as string;
  const {
    getTournamentState,
    updateTournamentSettings,
    tournamentAdminAction,
    joinTournamentRoom,
  } = useTournamentSocket();
  const { toast } = useToast();
  const { currentTheme } = useTheme();
  const supabase = createClientComponentClient();

  const [tournamentData, setTournamentData] =
    useState<TournamentStateResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // useTournamentEvents must be called AFTER currentUserId is defined
  const {
    tournamentState: realTimeState,
    statusChange,
  } = useTournamentEvents(tournamentId, {
    currentUserId,
  });

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

        // Extract status and hostId using type-safe utilities
        const status = getStatusString(response.status, response.tournament?.status);
        const hostId = response.hostId || response.tournament?.host_id;

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
        // Join tournament room for real-time updates
        joinTournamentRoom(tournamentId).catch((err) => {
          console.error("[Tournament] Failed to join room:", err);
        });
      } catch (error: unknown) {
        console.error("Failed to fetch tournament state", error);
        toast({
          title: "Error",
          description: getErrorMessage(error),
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
  }, [tournamentId, currentUserId, getTournamentState, router, toast, joinTournamentRoom]);

  // Update tournament data when real-time state arrives
  useEffect(() => {
    if (realTimeState) {
      setTournamentData(realTimeState);
    }
  }, [realTimeState]);

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
      }
      // Real-time state will be updated via tournamentState event
    }
  }, [statusChange, tournamentId, currentUserId, router]);

  // Initialize settings form when tournament data loads
  useEffect(() => {
    if (tournamentData?.tournament) {
      const tournament = tournamentData.tournament;
      const status =
        typeof tournamentData.status === "string"
          ? tournamentData.status
          : (tournamentData as TournamentStateResponse & { status: { status: string } }).status?.status || tournament.status;

      if (status === "setup") {
        // Normalize tournament data for consistent camelCase access
        const normalized = normalizeTournament(tournament);

        // Initialize form with existing values or defaults
        const existingBlindStructure =
          normalized.blindStructureTemplate.length > 0
            ? normalized.blindStructureTemplate.map((level: BlindLevel) => ({
                small: level.small,
                big: level.big,
              }))
            : [
                { small: 10, big: 20 },
                { small: 20, big: 40 },
                { small: 50, big: 100 },
              ];

        setSettingsForm({
          maxPlayers: normalized.maxPlayers?.toString() || "",
          maxPlayersPerTable: normalized.maxPlayersPerTable?.toString() || "9",
          startingStack: normalized.startingStack?.toString() || "10000",
          blindLevelDurationMinutes: normalized.blindLevelDurationMinutes?.toString() || "10",
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
    } catch (error: unknown) {
      console.error("[Tournament] Failed to update settings:", error);
      toast({
        title: "Error",
        description: getErrorMessage(error),
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
    } catch (error: unknown) {
      console.error("[Tournament] Failed to open registration:", error);
      toast({
        title: "Error",
        description: getErrorMessage(error),
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
  const status = getStatusString(tournamentData.status, tournament.status);

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
      title={`Setup: ${tournament.title || "Tournament"}`}
      footer={
        <div className="flex flex-col gap-2 w-full">
          <Button
            onClick={handleUpdateSettings}
            disabled={isUpdatingSettings || isOpeningRegistration}
            size="lg"
            variant="secondary"
            className="w-full font-bold text-sm h-12"
          >
            {isUpdatingSettings ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Settings
          </Button>
          {status === "setup" && (
            <Button
              onClick={handleOpenRegistration}
              disabled={isUpdatingSettings || isOpeningRegistration}
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
            >
              {isOpeningRegistration ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Users className="mr-2 h-4 w-4" />
              )}
              Open Registration
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        <Link
          href={`/play/tournaments/${tournamentId}`}
          className="inline-flex items-center text-xs text-slate-500 hover:text-white"
        >
          <ArrowLeft className="h-3 w-3 mr-1" /> Back
        </Link>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="px-3 pt-3 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings className="h-4 w-4 text-slate-400" />
              Configure Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-3 pb-3">
            <p className="text-xs text-slate-400">
              Configure your tournament settings before opening registration.
              All fields marked with * are required.
            </p>

            <Separator className="bg-slate-700" />

            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs">Max Players (Optional)</Label>
                <Input
                  type="number"
                  value={settingsForm.maxPlayers}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      maxPlayers: e.target.value,
                    })
                  }
                  className="bg-slate-900 border-slate-800 h-9 text-sm [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                  min="1"
                  placeholder="Unlimited"
                />
                <p className="text-xs text-slate-500">
                  Leave empty for unlimited players. Tables will be created
                  automatically.
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Players Per Table *</Label>
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
                  className="bg-slate-900 border-slate-800 h-9 text-sm [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                  min="2"
                  max="10"
                />
                <p className="text-xs text-slate-500">
                  Must be between 2 and 10
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Starting Stack *</Label>
                <Input
                  type="number"
                  value={settingsForm.startingStack}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      startingStack: e.target.value,
                    })
                  }
                  className="bg-slate-900 border-slate-800 h-9 text-sm [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                  min="1"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Blind Level Duration (minutes) *</Label>
                <Input
                  type="number"
                  value={settingsForm.blindLevelDurationMinutes}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      blindLevelDurationMinutes: e.target.value,
                    })
                  }
                  className="bg-slate-900 border-slate-800 h-9 text-sm [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                  min="1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Blind Structure *</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addBlindLevel}
                  className="h-7 text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
              <div className="space-y-1.5">
                {settingsForm.blindStructure.map((level, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-1.5 p-2 bg-slate-900/50 border border-slate-700 rounded-lg"
                  >
                    <span className="text-xs text-slate-500 w-8 flex-shrink-0">
                      L{index + 1}
                    </span>
                    <div className="flex items-center gap-1 flex-1">
                      <div className="flex-1 min-w-0">
                        <Label className="text-[10px] text-slate-500 block">
                          Small
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
                          className="bg-slate-800 border-slate-700 h-7 text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                          min="1"
                        />
                      </div>
                      <span className="text-slate-500 pt-4 text-xs">/</span>
                      <div className="flex-1 min-w-0">
                        <Label className="text-[10px] text-slate-500 block">
                          Big
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
                          className="bg-slate-800 border-slate-700 h-7 text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                          min="1"
                        />
                      </div>
                    </div>
                    {settingsForm.blindStructure.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeBlindLevel(index)}
                        className="h-7 w-7 p-0 text-red-400 hover:text-red-300 flex-shrink-0"
                      >
                        <X className="h-3 w-3" />
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
