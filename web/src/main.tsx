import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { JoinRoute } from "@/routes/join";
import { PlayRoute } from "@/routes/play";
import { GmLoginRoute } from "@/routes/gm-login";
import { GmRoomRoute } from "@/routes/gm-room";
import { PresentRoute } from "@/routes/present";
import { syncDocumentLanguage, useLanguage } from "@/i18n";
import "./index.css";

/**
 * The one subscriber to the language store: `t()` is a plain read, so a switch
 * only reaches the screen because this re-renders everything and nothing below
 * is memoised.
 */
function App() {
  useLanguage();
  return (
    <Routes>
      <Route path="/" element={<JoinRoute />} />
      <Route path="/play" element={<PlayRoute />} />
      <Route path="/gm" element={<GmLoginRoute />} />
      <Route path="/gm/:code" element={<GmRoomRoute />} />
      {/* The shared screen: read-only in v1 (SPEC.md section 8). */}
      <Route path="/present/:code" element={<PresentRoute />} />
      <Route path="*" element={<JoinRoute />} />
    </Routes>
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
