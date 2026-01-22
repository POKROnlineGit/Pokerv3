"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQueue } from "@/components/providers/ActiveStatusProvider";
import { useTheme } from "@/components/providers/PreferencesProvider";
import { useQueueSocket } from "@/lib/api/socket/queue";
import { X, Loader2 } from "lucide-react";

export default function QueuePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentTheme } = useTheme();
  const type = searchParams.get("type") || "six_max";

  const { leaveQueue: leaveQueueGlobal } = useQueue();

  // Use the new socket hook
  const { isConnected, isLoading, queueStatus, error, leaveQueue } = useQueueSocket(type, {
    onMatchFound: (gameId) => {
      router.push(`/play/game/${gameId}`);
    },
  });

  const handleLeaveQueue = () => {
    try {
      leaveQueue();
      leaveQueueGlobal(type); // Clear global state
    } catch {
      // Error handled silently
    } finally {
      router.push("/play/online");
    }
  };

  // Helper to format variant name
  const variantName = type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  if (isLoading) {
    return (
      <div className="min-h-screen relative">
        <div className="relative z-10">
          <div className="container mx-auto px-4 py-8 flex items-center justify-center min-h-[60vh]">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      <div className="relative z-10">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-md mx-auto">
            <Card className="bg-card">
              <CardHeader>
                <CardTitle>Searching for Players...</CardTitle>
                <CardDescription>
                  {queueStatus
                    ? `Players in queue: ${queueStatus.count} / ${queueStatus.target}`
                    : type === "heads_up"
                    ? "Waiting for 1 opponent..."
                    : "Waiting for more players..."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center py-8">
                  <div
                    className="text-3xl font-semibold mb-2"
                    style={{ color: 'var(--theme-accent-0)' }}
                  >
                    {queueStatus
                      ? `Waiting for ${queueStatus.needed} more player${
                          queueStatus.needed !== 1 ? "s" : ""
                        }...`
                      : type === "heads_up"
                      ? "Searching for an opponent..."
                      : "Searching for players..."}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    {queueStatus
                      ? `Players in queue: ${queueStatus.count} / ${queueStatus.target}`
                      : "You'll be moved to the table automatically when a match is found."}
                  </p>
                </div>

                {error && (
                  <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                    {error}
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Matchmaking status</span>
                  <span style={{ color: isConnected ? 'var(--theme-accent-0)' : "#ef4444" }}>
                    {isConnected ? "Connected" : "Disconnected"}
                  </span>
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleLeaveQueue}
                  style={{
                    borderColor: 'var(--theme-accent-0)',
                    color: 'var(--theme-accent-0)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--theme-accent-0)';
                    e.currentTarget.style.color = "white";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = 'var(--theme-accent-0)';
                  }}
                >
                  <X className="mr-2 h-4 w-4" />
                  Leave Queue
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
