'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSocket } from '@/lib/socketClient';

type LeaveGameButtonProps = {
  gameId?: string;
};

export function LeaveGameButton({ gameId }: LeaveGameButtonProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const socket = useSocket();

  const handleLeave = () => {
    try {
      if (socket && !socket.connected) {
        socket.connect();
      }
      socket.emit('leaveGame', gameId);
    } catch (error) {
      console.error('[LeaveGame] Failed to emit leaveGame:', error);
    } finally {
      setOpen(false);
      router.push('/play'); // Immediate redirect
    }
  };

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Leave Game
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave Game?</DialogTitle>
            <DialogDescription>
              You will be auto-folded and removed at the end of this hand.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleLeave}>
              Leave Game
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}







