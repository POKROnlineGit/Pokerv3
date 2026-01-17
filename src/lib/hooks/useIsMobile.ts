"use client";

import { useState, useEffect } from "react";

export function useIsMobile(breakpoint: number = 768) {
  // Initialize with generic false, or undefined to force a loading state
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    // Check if we're on the client side
    if (typeof window === "undefined") return;

    // 1. Create the media query list
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);

    // 2. Define the callback
    const onChange = () => {
      setIsMobile(mql.matches);
    };

    // 3. Set the initial value immediately on mount
    // This runs only on the client, ensuring hydration matches initially
    // but updates instantly after mount.
    setIsMobile(mql.matches);

    // 4. Listen for changes
    mql.addEventListener("change", onChange);

    // 5. Cleanup
    return () => mql.removeEventListener("change", onChange);
  }, [breakpoint]);

  return isMobile;
}

