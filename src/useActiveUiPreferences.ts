import { useEffect, useState } from "react";
import { normalizeUiLocale, setActiveLocale } from "./i18n";
import { useQaStore } from "./store/useQaStore";
import { normalizeUiTheme, resolveUiTheme } from "./uiPreferences";

export function useActiveUiPreferences(): void {
  const preferredLocale = useQaStore((state) => state.preferences.locale);
  const preferredTheme = useQaStore((state) => state.preferences.theme);
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const locale = normalizeUiLocale(preferredLocale, navigator.language);
  const theme = normalizeUiTheme(preferredTheme);
  const resolvedTheme = resolveUiTheme(theme, systemPrefersDark);

  // Client-side apenas: definir antes dos filhos renderizarem evita um frame no idioma anterior.
  setActiveLocale(locale);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dataset.theme = resolvedTheme;
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute("content", resolvedTheme === "dark" ? "#111827" : "#ffffff");
  }, [locale, resolvedTheme]);
}
