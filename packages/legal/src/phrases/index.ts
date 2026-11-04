import type { Locale } from "../../../../apps/game/src/i18n";
import { de } from "./de";
import { en } from "./en";
import { es } from "./es";
import { fr, type PhraseKey } from "./fr";
import { it } from "./it";
import { nl } from "./nl";

export type Phrases = Record<PhraseKey, string>;
export const PHRASES: Record<Locale, Phrases> = { fr, en, nl, de, es, it };
