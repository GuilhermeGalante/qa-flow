import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter/wght.css";
import "./index.css";
import App from "./App";
import { createDesktopComposition } from "./platform/desktop/createDesktopComposition";
import { configureQaStore } from "./store/useQaStore";

configureQaStore(createDesktopComposition().store);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App runtimeMarker="qaflow-desktop-sqlite" />
  </StrictMode>,
);
