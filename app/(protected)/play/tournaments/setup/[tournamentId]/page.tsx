"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { PlayLayout } from "@/components/layout/PlayLayout";
import { Loader2 } from "lucide-react";

/**
 * Tournament Setup Page - Redirects to main tournament page
 *
 * This page is deprecated. Tournament setup is now handled on the main
 * tournament detail page during the "setup" status phase.
 */
export default function TournamentSetupPage() {
  const params = useParams();
  const router = useRouter();
  const tournamentId = params.tournamentId as string;

  useEffect(() => {
    if (tournamentId) {
      router.replace(`/play/tournaments/${tournamentId}`);
    }
  }, [tournamentId, router]);

  return (
    <PlayLayout title="Tournament Setup">
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    </PlayLayout>
  );
}
