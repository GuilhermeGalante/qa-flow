import assert from "node:assert/strict";
import test from "node:test";
import { normalizeUiTheme, resolveUiTheme } from "./uiPreferences.ts";

test("normaliza tema e resolve a preferência do sistema", () => {
  assert.equal(normalizeUiTheme("dark"), "dark");
  assert.equal(normalizeUiTheme("unsupported"), "system");
  assert.equal(resolveUiTheme("system", true), "dark");
  assert.equal(resolveUiTheme("system", false), "light");
  assert.equal(resolveUiTheme("light", true), "light");
});
