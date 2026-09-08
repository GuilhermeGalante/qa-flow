import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter/wght.css";
import "./index.css";
import App from "./App";
import { DesktopCompanionApp } from "./components/v2/DesktopCompanionApp";
import { createDesktopComposition } from "./platform/desktop/createDesktopComposition";
import { DesktopWindowCoordinator } from "./platform/desktop/DesktopWindowCoordinator";
import { configureQaStore } from "./store/useQaStore";

configureQaStore(createDesktopComposition().store);

const companionRunId = new URLSearchParams(window.location.search).get("companionRunId");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {companionRunId
      ? <DesktopCompanionApp runId={companionRunId} />
      : <><DesktopWindowCoordinator /><App runtimeMarker="qaflow-desktop-sqlite" /></>}
  </StrictMode>,
);
