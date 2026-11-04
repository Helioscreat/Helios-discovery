/**
 * Signalements et décisions de modération (DSA art. 16, 17, 20).
 * Art. 17(3) : la motivation indique la mesure et sa portée, les faits et circonstances, l'usage éventuel
 * de moyens automatisés, le fondement (disposition légale ou clause des CGU) et les voies de recours.
 */
export type ReportReason = "insult" | "harassment" | "hate" | "sexual" | "personalData" | "spam" | "illegal" | "other";
export const REPORT_REASONS: ReportReason[] = ["insult", "harassment", "hate", "sexual", "personalData", "spam", "illegal", "other"];

export type Restriction = "removeContent" | "muteChat7d" | "renameNickname" | "suspendAccount" | "noAction";

export type Ground = { type: "tos"; clause: string } | { type: "illegal"; law: string };

export interface DecisionInput {
  reportId: string;
  moderatorId: string;
  restriction: Restriction;
  facts: string;
  automated: boolean;
  ground: Ground | null;
}

export const REDRESS = ["internalAppeal", "outOfCourtSettlement", "judicialRedress"] as const;

export interface StatementOfReasons {
  restriction: Restriction;
  scope: string;
  facts: string;
  automated: boolean;
  ground: Ground;
  redress: typeof REDRESS;
}

export function validateDecision(d: DecisionInput): string[] {
  const errors: string[] = [];
  if (!d.moderatorId) errors.push("modérateur manquant");
  if (!d.facts || d.facts.trim().length < 10) errors.push("exposé des faits manquant (art. 17(3)(b))");
  if (d.restriction !== "noAction" && !d.ground) errors.push("fondement manquant (art. 17(3)(d)/(e))");
  if (d.ground?.type === "tos" && !/^CGU\s?\d+(\.\d+)?$/.test(d.ground.clause)) errors.push("clause des CGU invalide (attendu « CGU 4.2 »)");
  if (d.ground?.type === "illegal" && d.ground.law.trim().length < 3) errors.push("disposition légale manquante");
  return errors;
}

const SCOPE: Record<Restriction, string> = {
  removeContent: "Le contenu signalé est retiré.",
  muteChat7d: "Accès au chat suspendu pendant 7 jours.",
  renameNickname: "Pseudonyme remplacé ; un nouveau pseudonyme doit être choisi.",
  suspendAccount: "Compte suspendu jusqu'à l'issue d'un éventuel recours.",
  noAction: "Aucune mesure : le contenu reste visible.",
};

export function statementOfReasons(d: DecisionInput): StatementOfReasons {
  return {
    restriction: d.restriction,
    scope: SCOPE[d.restriction],
    facts: d.facts,
    automated: d.automated,
    ground: d.ground ?? { type: "tos", clause: "CGU 0" },
    redress: REDRESS,
  };
}
