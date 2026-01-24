'use client';

import { useUserProfile } from '@/lib/hooks/useUserProfile';

interface UserProfileFooterProps {
  className?: string;
}

export function UserProfileFooter({ className }: UserProfileFooterProps) {
  const { username, chips } = useUserProfile();

  return (
    <div className={`flex-shrink-0 border-t p-2 min-h-[3rem] ${className ?? ''}`}>
      {username ? (
        <div className="space-y-1">
          <div className="text-base font-medium text-white">
            {username}
          </div>
          <div className="text-sm text-slate-400">
            {chips !== null ? `${chips.toLocaleString()} chips` : '—'}
          </div>
        </div>
      ) : (
        // Invisible placeholder to prevent layout shift
        <div className="space-y-1 opacity-0">
          <div className="text-base font-medium">Placeholder</div>
          <div className="text-sm">Placeholder</div>
        </div>
      )}
    </div>
  );
}
