# Analyse des Changements de Conception - Refactorisation

> ⚠️ **Document HISTORIQUE (07/11/2026)** : plusieurs points décrits ici ont été
> **corrigés depuis** par les audits et leurs remédiations — notamment le token
> généré AVANT le `save()` (désormais généré après, avec l'id réel — cf. audit
> sécurité C6 du 06/11), le champ `token` présent dans le schéma de validation
> (retiré par le correctif C1), et le champ `contractAuth` du mailer (devenu
> `contractData` avec whitelist). Ce document décrit l'INTENTION de l'époque ;
> l'état réel du code fait foi : voir `AUDIT_SECURITE_LOGIQUE_BUGS_2026-11-06.md`
> et `AUDIT_PROPRETE_STRUCTURE_2026-11-07.md`.

## Vue d'ensemble

Cette refactorisation introduit un **système d'authentification basé sur les tokens pour les contrats**, permettant un accès public sécurisé aux contrats sans nécessiter d'authentification utilisateur complète. Cette approche transforme fondamentalement le modèle d'autorisation de l'application.

---

## 1. Système d'Authentification par Token de Contrat

### 1.1 Ajout du champ `token` dans l'entité Contract

**Fichier modifié :** `src/database/entity/Contract.ts`

- **Ajout :** Champ `token` de type `string` nullable dans l'entité Contract
- **Impact :** Chaque contrat peut maintenant posséder un token unique permettant son identification et son accès sécurisé

```typescript
@Column({ nullable: true })
token: string;
```

### 1.2 Génération automatique de tokens JWT

**Fichier modifié :** `src/controllers/ContractController.ts`

- **Nouvelle méthode :** `generateContractToken()`
  - Génère un token JWT contenant l'ID du contrat
  - Utilise `JWT_PRIVATE` comme secret
  - Le token est automatiquement assigné lors de la création d'un contrat

- **Modification de `create()` :**
  - Le token est généré **avant** la sauvegarde du contrat
  - Le contrat peut être créé **sans utilisateur** (vérification conditionnelle de `res.locals.user`)
  - Le token est inclus dans la réponse

---

## 2. Transformation du Modèle d'Autorisation

### 2.1 Passage d'un système utilisateur à un système token

**Avant :**
- Les contrats étaient liés à un utilisateur propriétaire
- L'autorisation se basait sur la vérification `contract.user.id === res.locals.user.id`
- Les opérations nécessitaient une authentification utilisateur complète

**Après :**
- Les contrats peuvent exister sans utilisateur propriétaire (`user: User | null`)
- L'autorisation se base sur la vérification du token : `contract.token === contractData.token`
- Les opérations peuvent être effectuées avec uniquement le token du contrat

### 2.2 Modifications dans les méthodes CRUD

#### `update()` - ContractController
- **Avant :** Vérifiait que `contract.user.id === res.locals.user.id`
- **Après :** Vérifie que `contract.token === contractData.token`
- **Impact :** Permet la mise à jour sans authentification utilisateur, uniquement avec le token

#### `delete()` - ContractController
- **Avant :** Vérifiait la propriété via `contract.user.id`
- **Après :** Vérifie le token via `contract.token === token` (passé en paramètre)
- **Impact :** Suppression possible avec uniquement le token en paramètre d'URL

#### `create()` - ContractController
- **Avant :** Nécessitait un utilisateur connecté obligatoirement
- **Après :** L'utilisateur est optionnel (`if (res.locals.user)`)
- **Impact :** Création de contrats anonymes possible

---

## 3. Nouvelles Routes et Endpoints

### 3.1 Routes publiques ajoutées

**Fichier modifié :** `src/routes/public.ts`

Les routes suivantes sont maintenant accessibles **sans authentification JWT utilisateur** :

```typescript
// Routes de contrat publiques
{ method: "POST", path: "/api/contract" },              // Création
{ method: "PATCH", path: "/api/contract" },              // Mise à jour
{ method: "POST", path: "/api/contract/list-ids" },     // Liste par IDs
{ method: "GET", path: "/api/contract/get-by-token" }   // Récupération par token
```

**Impact :** Ces endpoints peuvent être utilisés par des utilisateurs non authentifiés, uniquement avec le token du contrat.

### 3.2 Nouvelles méthodes dans ContractController

#### `getByToken()` - Nouvelle méthode
- **Route :** `GET /api/contract/get-by-token?token=xxx`
- **Fonctionnalité :** Récupère un contrat complet en utilisant uniquement son token
- **Cas d'usage :** Permet à un destinataire de contrat de le récupérer via le lien de signature

#### `listFromIDS()` - Réactivée
- **Route :** `POST /api/contract/list-ids`
- **Fonctionnalité :** Récupère plusieurs contrats en validant leurs tokens
- **Format attendu :** `{ ids: "[[id1, token1], [id2, token2], ...]" }`
- **Sécurité :** Valide chaque token avant d'inclure le contrat dans la réponse

---

## 4. Améliorations du MailController

### 4.1 Validation du contrat avant envoi

**Fichier modifié :** `src/controllers/MailController.ts`

- **Ajout :** Validation du contrat via `contractAuth` avant l'envoi de l'email
- **Processus :**
  1. Parse `contractAuth` (JSON string contenant `{ id, token }`)
  2. Récupère le contrat depuis la base de données
  3. Vérifie que le token correspond
  4. Si valide, prépare et envoie l'email

- **Sécurité :** Empêche l'envoi d'emails pour des contrats non autorisés

### 4.2 Ajout du lien de signature

- **Modification :** `prepareMailOptions()` accepte maintenant `contractToken`
- **Ajout :** Lien de signature dans le corps de l'email : `http://${FRONTEND_URL}?signe-back=${contractToken}`
- **Format email :** 
  ```
  Replacement contract proposed. Find the contract in the attachment.
  
  [body optionnel]
  
  To sign the contract, click on the following link: [lien]
  ```

### 4.3 Internationalisation

- **Changement :** Messages traduits en anglais
- **Impact :** Cohérence avec le reste de l'application et préparation à l'internationalisation

---

## 5. Simplification et Nettoyage

### 5.1 Suppression de la synchronisation

**Fichier modifié :** `src/controllers/ContractController.ts`

- **Supprimé :** Méthode `synchronizeContracts()` et ses méthodes privées associées :
  - `SyncContractsSaveLocalToBDD()`
  - `SyncContractToDelete()`
  - `SyncContractsUpdate()`
- **Route commentée :** `POST /api/contract/register-local-contrats`
- **Raison :** Simplification de l'architecture, remplacée par le système de tokens

### 5.2 Optimisation des requêtes

- **Modification dans `update()` :** Suppression de `relations: ["user"]` dans la requête
- **Impact :** Réduction de la charge de la base de données, le user n'est plus nécessaire pour l'autorisation

---

## 6. Schéma de Validation

### 6.1 Ajout du token dans le schéma

**Fichier modifié :** `src/controllers/ContractController.ts`

- **Ajout :** `token: { type: "string" }` dans `contractValidationPattern`
- **Impact :** Le token peut être validé lors de la création/mise à jour

---

## 7. Flux d'Utilisation Typique

### 7.1 Création et partage d'un contrat

1. **Création :** `POST /api/contract` (avec ou sans utilisateur)
   - Le système génère automatiquement un token
   - Le token est retourné dans la réponse

2. **Envoi par email :** `POST /api/mail/send-contract`
   - Fournir `contractAuth: { id, token }`
   - Le système valide le token
   - L'email contient un lien avec le token

3. **Récupération par le destinataire :** `GET /api/contract/get-by-token?token=xxx`
   - Le destinataire clique sur le lien
   - Récupère le contrat complet sans authentification

4. **Modification :** `PATCH /api/contract`
   - Fournir le token dans le body
   - Le système valide le token avant modification

5. **Suppression :** `DELETE /api/contract/:id?token=xxx`
   - Le token est passé en paramètre d'URL
   - Validation avant suppression

---

## 8. Avantages de cette Refactorisation

### 8.1 Sécurité
- ✅ Authentification décentralisée par contrat
- ✅ Pas de dépendance à une session utilisateur
- ✅ Tokens JWT sécurisés et vérifiables

### 8.2 Flexibilité
- ✅ Contrats peuvent exister sans utilisateur propriétaire
- ✅ Partage simplifié via token
- ✅ Workflow de signature facilité

### 8.3 Simplicité
- ✅ Suppression de la logique de synchronisation complexe
- ✅ Code plus maintenable
- ✅ Moins de dépendances entre entités

### 8.4 Expérience Utilisateur
- ✅ Accès aux contrats sans création de compte
- ✅ Processus de signature simplifié
- ✅ Partage direct via lien

---

## 9. Points d'Attention et Considérations

### 9.1 Sécurité
- ⚠️ Les tokens doivent être stockés de manière sécurisée côté client
- ⚠️ Le secret JWT (`JWT_PRIVATE`) doit être robuste et protégé
- ⚠️ Considérer l'expiration des tokens si nécessaire

### 9.2 Migration
- ⚠️ Les contrats existants n'ont pas de token (nullable)
- ⚠️ Une migration peut être nécessaire pour générer des tokens pour les contrats existants
- ⚠️ Les anciennes méthodes basées sur l'utilisateur peuvent nécessiter une période de transition

### 9.3 Compatibilité
- ⚠️ Les clients existants utilisant l'authentification utilisateur doivent être mis à jour
- ⚠️ La méthode `synchronizeContracts` étant supprimée, les clients l'utilisant doivent migrer

---

## 10. Résumé des Fichiers Modifiés

| Fichier | Type de modification | Impact |
|---------|---------------------|--------|
| `src/database/entity/Contract.ts` | Ajout champ `token` | Structure de données |
| `src/controllers/ContractController.ts` | Refactorisation complète | Logique métier |
| `src/controllers/MailController.ts` | Validation contrat + lien signature | Intégration email |
| `src/routes/contract.ts` | Nouvelles routes activées | API publique |
| `src/routes/mail.ts` | Aucun changement fonctionnel | - |
| `src/routes/public.ts` | Ajout routes publiques | Sécurité/accès |

---

## Conclusion

Cette refactorisation représente un **changement architectural majeur** qui transforme l'application d'un modèle centré sur l'utilisateur vers un modèle centré sur les contrats avec authentification par token. Cette approche offre plus de flexibilité pour le partage et la signature de contrats, tout en maintenant un niveau de sécurité approprié grâce à l'utilisation de tokens JWT.

Le système est maintenant mieux adapté pour des workflows où les contrats peuvent être créés et partagés sans nécessiter que tous les participants aient un compte utilisateur dans le système.
