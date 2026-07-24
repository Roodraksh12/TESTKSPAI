import { useEffect, useRef } from "react";

/**
 * Refetch when the tab becomes visible again — keeps stats live without
 * blocking paint or running work on the client.
 */
export function useVisibilityRefetch(refetch: () => void | Promise<unknown>, enabled = true) {
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refetchRef.current();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [enabled]);
}
