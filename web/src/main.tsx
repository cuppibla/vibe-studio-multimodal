import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";
import { ThemeProvider } from "./components/ThemeProvider";

// The skin: "haunted" (the Halloween edition, the default) or "" for the
// base Vibetube look. Set before the first render so the theme can pick its
// default mood from it (index.css, ThemeProvider.tsx).
document.documentElement.dataset.skin = (import.meta.env.VITE_SKIN as string | undefined) ?? "haunted";

// StrictMode is omitted on purpose: its dev-only double mount cancels
// framer-motion entrance animations mid-flight.
createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ThemeProvider>,
);
