import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

/**
 * CRITICAL: Block ALL popstate events BEFORE React mounts.
 * WebView session restore after a crash replays stale history entries,
 * each firing a popstate event. If React Router processes these,
 * it cycles through old routes causing an infinite loop + crash.
 * This synchronous listener runs before BrowserRouter's listener exists.
 */
const earlyBlockPopState = (e: PopStateEvent) => {
  e.stopImmediatePropagation();
  e.preventDefault();
  // Force URL back to whatever it should be (root on fresh load)
  window.history.replaceState(null, '', window.location.pathname);
};
window.addEventListener('popstate', earlyBlockPopState, true);

// Clean up the early blocker after React mounts and useFlutterBridge takes over
requestAnimationFrame(() => {
  setTimeout(() => {
    window.removeEventListener('popstate', earlyBlockPopState, true);
  }, 2000);
});

createRoot(document.getElementById("root")!).render(<App />);
