# Google Play — Sécurité des données

Réponses générées depuis packages/legal/src/inventory.ts (2026-11-v1). À reporter dans Play Console > Contenu de l'application > Sécurité des données.

## Pratiques générales

| Question | Réponse |
|---|---|
| L'application collecte-t-elle ou partage-t-elle des données utilisateur des types requis ? | Oui |
| Toutes les données collectées sont-elles chiffrées en transit ? | Oui (HTTPS) |
| Proposez-vous un moyen de demander la suppression des données ? | Oui : dans l'application (Paramètres > Confidentialité) et par e-mail (fleurant.m@icloud.com) |
| Application conforme à la politique Familles ? | Non applicable : public 13 ans et plus, hors programme Familles |

## Types de données

| Catégorie | Collectée | Partagée | Obligatoire | Finalités | Types internes |
|---|---|---|---|---|---|
| Personal info › User IDs | Oui | Non | Obligatoire | Fonctionnement de l'application ; Gestion du compte | account.id |
| Personal info › Other info | Oui | Non | Obligatoire | Fonctionnement de l'application ; Prévention des fraudes, sécurité et conformité | account.country, age.birthMonth |
| Personal info › Name | Oui | Non | Facultatif | Fonctionnement de l'application | account.nickname |
| App activity › Other actions | Oui | Non | Obligatoire | Prévention des fraudes, sécurité et conformité ; Fonctionnement de l'application | consent.record, team.membership, block.list, moderation.decision, inbox.notice, rights.deletionRequest |
| Financial info › Purchase history | Oui | Non | Facultatif | Fonctionnement de l'application ; Prévention des fraudes, sécurité et conformité | purchase.history |
| Messages › Other in-app messages | Oui | Non | Facultatif | Fonctionnement de l'application | chat.message |
| App activity › Other user-generated content | Oui | Non | Facultatif | Prévention des fraudes, sécurité et conformité ; Fonctionnement de l'application | report.content, appeal.content, support.message |
| Personal info › Email address | Oui | Non | Facultatif | Fonctionnement de l'application | support.email |
| App activity › App interactions | Oui | Non | Facultatif | Analyses | analytics.events |
| Device or other IDs | Oui | Oui (ads.deviceId) | Facultatif | Publicité ou marketing ; Prévention des fraudes, sécurité et conformité ; Fonctionnement de l'application | ads.deviceId, push.token |

« Partagée » signifie transmise à un tiers pour son propre compte : seul l'identifiant publicitaire l'est (SDK Google Mobile Ads, après consentement). Les données traitées par nos sous-traitants pour notre compte ne sont pas « partagées » au sens de Google.
