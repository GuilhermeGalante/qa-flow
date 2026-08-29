import { createQaStore, type QaStore } from "../../store/useQaStore";
import { WebRuntimeAdapter } from "./webRuntimeAdapter";
import { WebTransferAdapter } from "./webTransferAdapter";
import { WebWorkspaceAdapter } from "./webWorkspaceAdapter";

export interface WebComposition {
  store: QaStore;
}

export function createWebComposition(): WebComposition {
  const workspacePort = new WebWorkspaceAdapter();
  const transferPort = new WebTransferAdapter(workspacePort);
  const runtimePort = new WebRuntimeAdapter();
  return {
    store: createQaStore({ workspacePort, transferPort, runtimePort }),
  };
}

