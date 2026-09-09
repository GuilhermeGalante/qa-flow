import type { LocalPreferences } from "./platform/contracts/dtos";

export type UiTheme = NonNullable<LocalPreferences["theme"]>;
export type ResolvedTheme = Exclude<UiTheme, "system">;

export function normalizeUiTheme(value: unknown): UiTheme {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function resolveUiTheme(theme: UiTheme, systemPrefersDark: boolean): ResolvedTheme {
  return theme === "system" ? (systemPrefersDark ? "dark" : "light") : theme;
}
