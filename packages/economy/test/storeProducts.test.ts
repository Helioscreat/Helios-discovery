import { describe, expect, it } from "vitest";
import { CATALOG, storeProduct } from "../src";

describe("déclaration des articles dans les stores", () => {
  it("chaque article a un type Google et Apple cohérent ; aucun produit payant aléatoire", () => {
    for (const s of CATALOG) {
      const p = storeProduct(s);
      expect(p.productId).toBe(s.id);
      expect(p.productId).toMatch(/^[a-z0-9_]{1,40}$/); // identifiant accepté par les deux consoles
      if (s.kind === "subscription") expect([p.google.type, p.apple.type]).toEqual(["subs", "autoRenewable"]);
      else expect(p.google.type).toBe("inapp");
      // Un article « une seule fois par compte » ne doit pas être consommé, sinon le store permettrait de le racheter.
      if (s.kind === "oneTime") expect([p.google.consumable, p.apple.type]).toEqual([false, "nonConsumable"]);
      // Le passe se rachète à chaque saison.
      if (s.kind === "seasonPass") expect([p.google.consumable, p.apple.type]).toEqual([true, "consumable"]);
    }
  });
});
