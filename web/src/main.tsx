import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { JoinRoute } from "@/routes/join";
import { PlayRoute } from "@/routes/play";
import { GmLoginRoute } from "@/routes/gm-login";
import { GmRoomLayout, GmSectionNotFound } from "@/routes/gm/layout";
import { GmOverviewRoute } from "@/routes/gm/overview";
import { GmPlayersRoute } from "@/routes/gm/players";
import { GmBuzzerRoute } from "@/routes/gm/buzzer";
import { GmPuzzlesRoute } from "@/routes/gm/puzzles";
import { GmReviewRoute } from "@/routes/gm/review";
import { PresentRoute } from "@/routes/present";
import { Toaster } from "@/components/ui/sonner";
import { syncDocumentLanguage, useLanguage } from "@/i18n";
import "@fontsource-variable/outfit";
import "./index.css";

/**
 * The one subscriber to the language store: `t()` is a plain read, so a switch
 * only reaches the screen because this re-renders everything and nothing below
 * is memoised.
 */
function App() {
  useLanguage();
  return (
    <>
      {/* A refused event is a passing notice, not a banner that reflows the top
          of the panel while the game master is mid-round. */}
      <Toaster position="top-center" />

      <Routes>
        <Route path="/" element={<JoinRoute />} />
        <Route path="/play" element={<PlayRoute />} />
        <Route path="/gm" element={<GmLoginRoute />} />

        {/* Guard, socket and chrome live on the layout, so one connection
            outlives every move between sections. */}
        <Route path="/gm/:code" element={<GmRoomLayout />}>
          <Route index element={<GmOverviewRoute />} />
          <Route path="players" element={<GmPlayersRoute />} />
          <Route path="buzzer" element={<GmBuzzerRoute />} />
          <Route path="puzzles" element={<GmPuzzlesRoute />} />
          <Route path="puzzles/review" element={<GmReviewRoute />} />
          <Route path="*" element={<GmSectionNotFound />} />
        </Route>

        {/* The shared screen: read-only in v1 (SPEC.md section 8). */}
        <Route path="/present/:code" element={<PresentRoute />} />
        <Route path="*" element={<JoinRoute />} />
      </Routes>
    </>
  );
}

// Before the first paint, so a German phone starts in German.
syncDocumentLanguage();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
