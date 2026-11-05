import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Apps natives Android et iOS. Identifiant et nom alignés sur deploy/build.json et sur les fiches AdMob
 * (un test le vérifie). Le jeu web (dist/) est copié dans les projets natifs par `npx cap sync`.
 */
const config: CapacitorConfig = {
  appId: "com.helioscreat.heliosdiscovery",
  appName: "Helios Discovery",
  webDir: "dist",
  android: {
    // Aucun contenu mixte : le serveur de l'éditeur est en HTTPS.
    allowMixedContent: false,
  },
  ios: {
    contentInset: "never",
  },
  plugins: {
    // Aucune transaction clôturée avant la vérification du reçu par le serveur (crédit puis clôture).
    NativePurchases: { autoFinishTransactions: false },
  },
};

export default config;
