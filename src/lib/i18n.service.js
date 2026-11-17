// The launcher's language: English and Spanish, English when in doubt (the ecosystem's rule,
// engine-specs UX.md "Languages").
//
// The preference is `auto | en | es`, remembered in localStorage: `auto` follows the browser
// (engine-specs `resolveLocale()`). `t()` and `tx()` read a jq79 store, so a template that calls
// them re-renders when the language changes — the top-bar switch needs no reload. The engine
// apps get the language when they open (`EngineAppHost.locale`).

import { $reactive } from 'jq79';
import { localize, resolveLocale } from '@wasm-gaming/engine-specs';
import { MESSAGES } from './messages.js';

const STORAGE_KEY = 'play.germade.locale';
const PREFERENCES = ['auto', 'en', 'es'];

const readStored = () => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return PREFERENCES.includes(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
};

const resolve = (preference) => (preference === 'auto' ? resolveLocale() : preference);

/** The preference and the language it resolves to (the one on screen). */
export const i18n = $reactive({ preference: 'auto', locale: 'en' });

const apply = (preference) => {
  i18n.preference = preference;
  i18n.locale = resolve(preference);
  if (typeof document !== 'undefined') document.documentElement.lang = i18n.locale;
};
apply(readStored());

/** Choose a language (or `auto`), remembered for the next visits. */
export function setLanguage(preference) {
  if (!PREFERENCES.includes(preference)) return;
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // The choice still holds for this visit.
  }
  apply(preference);
}

/** The other language: what the top-bar switch goes to. */
export const otherLanguage = () => (i18n.locale === 'es' ? 'en' : 'es');

/** The language on screen, for the engine apps (`EngineAppHost.locale`). */
export const currentLocale = () => i18n.locale;

/** A message by key, in the language on screen, with `{name}` filled from `params`. */
export function t(key, params = {}) {
  const entry = MESSAGES[key];
  const text = entry ? (entry[i18n.locale] ?? entry.en) : key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

/** A catalog text (`'text'` or `{ en, es }`) in the language on screen. */
export const tx = (text) => (text == null ? '' : localize(text, i18n.locale));

/** A count with its word: `plural(3, 'game')` → "3 juegos" (keys `<word>.one` / `<word>.many`). */
export const plural = (count, word, params = {}) => t(`${word}.${count === 1 ? 'one' : 'many'}`, { count, ...params });
