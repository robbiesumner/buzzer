/**
 * A media query rather than Tailwind's `lg:`, because the GM panel does not
 * merely restyle at this width — it stops being tabs. Rendering both and hiding
 * one with CSS would put two of every control in the document, which a screen
 * reader reads twice.
 */
import { useEffect, useState } from "react";

export const WIDE_LAYOUT = "(min-width: 64rem)";

export function useMediaQuery(query: string): boolean {
  // Not in an effect: that draws the phone layout for one frame on every laptop.
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const list = window.matchMedia(query);
    const read = () => setMatches(list.matches);
    // A resize between the first render and this effect is otherwise missed.
    read();
    list.addEventListener("change", read);
    return () => list.removeEventListener("change", read);
  }, [query]);

  return matches;
}

export function useWideLayout(): boolean {
  return useMediaQuery(WIDE_LAYOUT);
}
