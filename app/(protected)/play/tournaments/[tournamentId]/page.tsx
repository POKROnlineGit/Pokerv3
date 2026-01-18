"use client";

import React, { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { PlayLayout } from "@/components/layout/PlayLayout";
import { Button } from "@/components/ui/button";
import { useTournamentSocket } from "@/lib/api/socket/tournament";
import { TournamentStateResponse } from "@/lib/types/tournament";
import { useToast } from "@/lib/hooks";
import { createClientComponentClient } from "@/lib/api/supabase/client";
import { Loader2, Users } from "lucide-react";
import Link from "next/link";

export default function TournamentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tournamentId = params.tournamentId as string;
  const { getTournamentState, registerTournament } = useTournamentSocket();
  const { toast } = useToast();
  const supabase = createClientComponentClient();

  const [tournamentData, setTournamentData] =
    useState<TournamentStateResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const hasCheckedRef = useRef(false);

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setCurrentUserId(data.user.id);
      }
    });
  }, [supabase]);

  // Check tournament state and handle redirects BEFORE rendering
  useEffect(() => {
    const checkTournamentState = async () => {
      if (!currentUserId || !tournamentId || hasCheckedRef.current) return;

      setIsLoading(true);
      hasCheckedRef.current = true;

      try {
        const response = await getTournamentState(tournamentId);
        console.log(
          "[Tournament] Raw response:",
          JSON.stringify(response, null, 2)
        );

        // Tournament doesn't exist
        if ("error" in response) {
          console.log("[Tournament] Tournament not found:", response.error);
          setIsLoading(false);
          toast({
            title: "Tournament Not Found",
            description: response.error,
            variant: "destructive",
          });
          router.replace("/play");
          return;
        }

        // Extract status - handle both string and object responses
        let status: string;
        let hostId: string | undefined;

        if (typeof response.status === "string") {
          // Expected structure: TournamentStateResponse
          status = response.status;
          hostId = response.hostId;
        } else if ((response as any).tournament) {
          // Response has nested tournament object
          status = (response as any).tournament.status;
          hostId =
            (response as any).tournament.hostId || (response as any).hostId;
        } else if (
          typeof (response as any).status === "object" &&
          (response as any).status.status
        ) {
          // Status is an object with a status property
          status = (response as any).status.status;
          hostId = (response as any).hostId;
        } else {
          console.error("[Tournament] Unknown response structure:", response);
          setIsLoading(false);
          toast({
            title: "Error",
            description: "Invalid tournament data received",
            variant: "destructive",
          });
          router.replace("/play");
          return;
        }

        console.log("[Tournament] Extracted values:", {
          status,
          hostId,
          currentUserId,
        });

        // Check status and handle redirects
        const isHost = hostId === currentUserId;

        if (status === "setup") {
          setIsLoading(false);
          if (isHost) {
            // Host: redirect to setup page
            console.log(
              "[Tournament] Setup status, host - redirecting to setup page"
            );
            router.replace(`/play/tournaments/setup/${tournamentId}`);
            return;
          } else {
            // Not host: redirect to /play with error
            console.log(
              "[Tournament] Setup status, not host - redirecting to /play"
            );
            toast({
              title: "Tournament Not Available",
              description:
                "This tournament is not currently open for registration.",
              variant: "default",
            });
            router.replace("/play");
            return;
          }
        }

        // Status is "registration" - stay on page and display data
        if (status === "registration") {
          console.log("[Tournament] Registration status - staying on page");
          setTournamentData(response as TournamentStateResponse);
          setIsLoading(false);
          return;
        }

        // Any other status - redirect to /play
        console.log("[Tournament] Unexpected status:", status);
        setIsLoading(false);
        toast({
          title: "Error",
          description: `Tournament is in ${status} status`,
          variant: "destructive",
        });
        router.replace("/play");
      } catch (error: any) {
        console.error("[Tournament] Error checking state:", error);
        toast({
          title: "Error",
          description: "Failed to load tournament",
          variant: "destructive",
        });
        router.replace("/play");
      }
    };

    if (tournamentId && currentUserId) {
      checkTournamentState();
    }
  }, [tournamentId, currentUserId, getTournamentState, router, toast]);

  // Show loading while checking state
  if (isLoading || !tournamentData) {
    return (
      <PlayLayout title="Tournament">
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      </PlayLayout>
    );
  }

  // Only render if we have data (status check passed)
  const tournament = tournamentData.tournament;
  const status =
    typeof tournamentData.status === "string"
      ? tournamentData.status
      : (tournamentData as any).status?.status || tournament?.status;
  const participants = tournamentData.participants || [];
  const hostId = tournamentData.hostId || tournament.host_id;
  const canRegister = tournamentData.canRegister ?? false;

  const isHost = currentUserId ? hostId === currentUserId : false;
  const isRegistered = currentUserId
    ? participants.some((p) => p.userId === currentUserId)
    : false;

  const handleRegister = async () => {
    setIsRegistering(true);
    try {
      const response = await registerTournament(tournamentId);
      if ("error" in response) {
        toast({
          title: "Registration Failed",
          description: response.error || "Failed to register for tournament",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Registered",
          description: "You have been registered for the tournament",
          variant: "default",
        });
        // Refresh tournament state
        const updatedResponse = await getTournamentState(tournamentId);
        if (!("error" in updatedResponse)) {
          setTournamentData(updatedResponse as TournamentStateResponse);
        }
      }
    } catch (error: any) {
      console.error("[Tournament] Registration error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to register for tournament",
        variant: "destructive",
      });
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <PlayLayout
      title={tournament?.title || tournament?.name || "Tournament"}
      footer={
        !isHost && canRegister && !isRegistered ? (
          <Button
            onClick={handleRegister}
            disabled={isRegistering}
            size="lg"
            className="w-full font-bold text-lg h-14"
          >
            {isRegistering ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Users className="mr-2 h-5 w-5" />
            )}
            Register for Tournament
          </Button>
        ) : null
      }
    >
      <div className="space-y-4 p-4">
        <Link
          href="/play"
          className="inline-flex items-center text-sm text-slate-500 hover:text-white"
        >
          ← Back to Modes
        </Link>

        <div className="space-y-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">
              {tournament?.title || tournament?.name || "Tournament"}
            </h1>
            <p className="text-slate-400 capitalize">Status: {status}</p>
          </div>

          <div className="flex items-center gap-4 text-lg">
            <div>
              <span className="text-slate-400">Participants: </span>
              <span className="font-semibold">{participants.length}</span>
              {tournament?.max_players && (
                <span className="text-slate-500">
                  {" "}
                  / {tournament.max_players}
                </span>
              )}
            </div>
          </div>

          {isRegistered && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <p className="text-emerald-400 font-medium">
                ✓ You are registered for this tournament
              </p>
            </div>
          )}

          {isHost && (
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-blue-400 font-medium">
                You are the host of this tournament
              </p>
            </div>
          )}
        </div>
      </div>
    </PlayLayout>
  );
}
