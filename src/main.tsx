import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider } from "convex/react";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";

import "./index.css";
import App from "./App";
import { convex } from "@/lib/convex";
import { AuthProvider } from "@/providers/AuthProvider";

// Tell the index.html boot guard that the app mounted. Set after the first
// render commit so a crash during render still reaches the boot guard.
const markBooted = () => document.documentElement.setAttribute("data-app-booted", "1");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <BrowserRouter>
        <AuthProvider>
          <App />
          <Toaster
            position="top-right"
            richColors
            closeButton
            toastOptions={{ className: "font-sans" }}
          />
        </AuthProvider>
      </BrowserRouter>
    </ConvexProvider>
  </StrictMode>,
);

requestAnimationFrame(markBooted);
