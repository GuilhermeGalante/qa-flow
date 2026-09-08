import { invoke } from "@tauri-apps/api/core";

export const WORKSPACE_CHANGED_EVENT = "qaflow://workspace-changed";
export const COMPANION_RUN_EVENT = "qaflow://companion-run";

export interface NativeCaptureTarget {
  id: string;
  title: string;
}

export interface NativeCapture {
  bytes: number[];
  mimeType: "image/png" | "video/mp4";
}

export function showDesktopCompanion(runId: string): Promise<void> {
  return invoke("companion_show", { runId });
}

export function hideDesktopCompanion(): Promise<void> {
  return invoke("companion_hide");
}

export function resizeDesktopCompanion(collapsed: boolean): Promise<void> {
  return invoke("companion_resize", { collapsed });
}

export function captureCurrentDisplay(): Promise<NativeCapture> {
  return invoke("capture_current_display");
}

export function listNativeCaptureTargets(): Promise<NativeCaptureTarget[]> {
  return invoke("capture_windows_list");
}

export function captureSpecificWindow(targetId: string): Promise<NativeCapture> {
  return invoke("capture_specific_window", { targetId });
}

export function startCurrentDisplayRecording(): Promise<void> {
  return invoke("recording_start_current");
}

export function startSpecificWindowRecording(targetId: string): Promise<void> {
  return invoke("recording_start_specific_window", { targetId });
}

export function stopNativeRecording(): Promise<NativeCapture> {
  return invoke("recording_stop");
}
