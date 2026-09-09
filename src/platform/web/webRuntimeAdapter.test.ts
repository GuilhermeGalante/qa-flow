import assert from "node:assert/strict";
import test from "node:test";
import { WebRuntimeAdapter } from "./webRuntimeAdapter.ts";

class MemoryLocalStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

test("preferências visuais web passam pela allowlist e sobrevivem a nova instância", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const localStorage = new MemoryLocalStorage();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });
  try {
    const first = new WebRuntimeAdapter();
    await first.setPreferences({ theme: "dark", locale: "es-ES", sidebarCollapsed: true });

    const second = new WebRuntimeAdapter();
    assert.deepEqual(await second.getPreferences(), {
      sidebarCollapsed: true,
      demandViewMode: undefined,
      demandSidebarWidth: undefined,
      theme: "dark",
      locale: "es-ES",
    });
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("valores visuais inválidos não entram nas preferências web", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const localStorage = new MemoryLocalStorage();
  localStorage.setItem("qa-flow-theme", "sepia");
  localStorage.setItem("qa-flow-locale", "fr-FR");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });
  try {
    const preferences = await new WebRuntimeAdapter().getPreferences();
    assert.equal(preferences.theme, undefined);
    assert.equal(preferences.locale, undefined);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
