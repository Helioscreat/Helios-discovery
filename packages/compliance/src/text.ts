/**
 * Filtre des pseudonymes et messages (DSA-07) : grossièretés multilingues (FR, EN, NL, DE, ES, IT),
 * données personnelles (e-mail, téléphone, adresse web). Normalisation : minuscules, accents retirés,
 * leet (0→o, 1→i, 3→e, 4→a, 5→s, 7→t, @→a, $→s), lettres répétées, séparateurs entre lettres.
 * Le filtre est une première ligne ; la modération humaine traite les signalements.
 */
const BANNED = [
  // fr
  "merde", "connard", "connasse", "salope", "encule", "pute", "putain", "batard", "nique", "niquer", "fdp", "ntm", "pd", "tafiole", "bouffon", "abruti", "debile", "cretin", "pouffiasse", "enfoire",
  // en
  "fuck", "fucker", "shit", "bitch", "asshole", "bastard", "cunt", "dick", "wanker", "slut", "whore", "retard", "faggot", "motherfucker", "prick", "twat",
  // nl
  "kut", "klootzak", "lul", "hoer", "tering", "kanker", "mongool", "eikel",
  // de
  "scheisse", "arschloch", "hurensohn", "fotze", "wichser", "schlampe", "missgeburt", "spast",
  // es
  "mierda", "puta", "cabron", "gilipollas", "pendejo", "joder", "coño", "maricon", "zorra",
  // it
  "cazzo", "stronzo", "vaffanculo", "puttana", "troia", "coglione", "minchia", "frocio",
];

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i" };

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[013457@$!]/g, (c) => LEET[c] ?? c)
    .replace(/(.)\1{2,}/g, "$1$1");
}

const bannedNorm = BANNED.map((w) => normalize(w).replace(/(.)\1+/g, "$1"));

const SUFFIXES = ["", "s", "e", "es", "er", "ers", "ing", "ed", "en", "a", "o", "i", "ne", "nne", "ies", "y"];

/**
 * Détection par mot entier (avec quelques suffixes de flexion), pour éviter les faux positifs de sous-chaîne
 * (« reputation » contient « puta », « salopette » contient « salope »). Les lettres espacées (« f u c k »)
 * sont recollées avant la comparaison.
 */
function containsBanned(text: string): boolean {
  const tokens = normalize(text).split(/[^a-zñ]+/).filter(Boolean);
  const words: string[] = [];
  let run = "";
  for (const tk of tokens) {
    if (tk.length === 1) run += tk;
    else {
      if (run.length >= 3) words.push(run);
      run = "";
      words.push(tk);
    }
  }
  if (run.length >= 3) words.push(run);
  for (const raw of words) {
    const w = raw.replace(/(.)\1+/g, "$1");
    for (const b of bannedNorm) if (w.startsWith(b) && SUFFIXES.includes(w.slice(b.length))) return true;
  }
  return false;
}

const EMAIL = /[a-z0-9._%+-]+\s*(@|\(at\)|\[at\]|\sat\s)\s*[a-z0-9.-]+\s*(\.|\(dot\)|\sdot\s)\s*[a-z]{2,}/i;
const URL = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|fr|net|org|io|be|de|nl|es|it|eu|gg|tv|me|co|app)\b)/i;
const PHONE = /(\+?\d[\s.-]?){8,}/;

export type FilterReason = "profanity" | "personalData" | "length" | "empty";

export function checkText(text: string, maxLen: number): { ok: true } | { ok: false; reason: FilterReason } {
  const t = text.trim();
  if (!t) return { ok: false, reason: "empty" };
  if (t.length > maxLen) return { ok: false, reason: "length" };
  if (EMAIL.test(t) || URL.test(t) || PHONE.test(t)) return { ok: false, reason: "personalData" };
  if (containsBanned(t)) return { ok: false, reason: "profanity" };
  return { ok: true };
}

/** Pseudonyme : 3 à 16 caractères, lettres, chiffres, espaces, tirets ; filtré (aucune donnée personnelle affichée). */
export function checkNickname(nick: string): { ok: true } | { ok: false; reason: FilterReason | "format" } {
  const t = nick.trim();
  if (t.length < 3 || t.length > 16 || !/^[\p{L}\p{N} _-]+$/u.test(t)) return { ok: false, reason: "format" };
  return checkText(t, 16);
}

export const checkMessage = (msg: string) => checkText(msg, 200);

/** Messages prédéfinis (seuls autorisés sous 16 ans) : identifiants → clés de texte. */
export const PRESET_MESSAGES = ["hello", "thanks", "needLives", "sentLives", "wellPlayed", "goodLuck", "seeYou", "teamChest"] as const;
export type PresetId = (typeof PRESET_MESSAGES)[number];
