import {
  applyBooster, applyMove, applyStarterKit, createGame, type GameEvent, type GameState, type InGameBooster, type Move, type Pos,
} from "@helios/core";
import { levelSpec } from "./levels";
import { consume, type Profile } from "./profile";

export interface Outcome {
  events: GameEvent[];
  before: GameState;
  after: GameState;
}

type Listener = (o: Outcome) => void;

/**
 * Contrôleur d'une partie : fait le lien entre le moteur pur, l'inventaire et l'affichage.
 * Toute modification d'état passe par ici ; la scène et l'interface s'abonnent aux résultats.
 */
export class GameSession {
  state: GameState;
  readonly level: number;
  pendingBooster: InGameBooster | null = null;
  /** Coups restants au moment de la victoire, avant le bonus de fin (sert au calcul des étoiles). */
  movesAtWin = 0;
  private listeners = new Set<Listener>();

  constructor(level: number, readonly profile: Profile, useStarterKit: boolean) {
    this.level = level;
    this.state = createGame(levelSpec(level));
    if (useStarterKit && consume(profile, "starterKit")) {
      this.state = applyStarterKit(this.state).state;
    }
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private commit(events: GameEvent[], after: GameState): Outcome {
    const before = this.state;
    this.state = after;
    for (const e of events) if (e.type === "bonusStart") this.movesAtWin = e.moves;
    const o = { events, before, after };
    for (const l of this.listeners) l(o);
    return o;
  }

  play(move: Move): Outcome | { rejected: GameEvent[] } {
    const r = applyMove(this.state, move);
    if (!r.accepted) return { rejected: r.events };
    return this.commit(r.events, r.state);
  }

  /** Utilise un booster. Il n'est décompté de l'inventaire que si le moteur l'accepte. */
  useBooster(b: InGameBooster, target?: Pos): Outcome | null {
    if (this.profile.inventory[b] <= 0) return null;
    const r = applyBooster(this.state, b, target);
    if (!r.accepted) return null;
    consume(this.profile, b);
    this.pendingBooster = null;
    return this.commit(r.events, r.state);
  }

  stars(): number {
    if (this.state.status !== "won") return 0;
    return 1 + (this.movesAtWin >= 3 ? 1 : 0) + (this.movesAtWin >= 7 ? 1 : 0);
  }
}
