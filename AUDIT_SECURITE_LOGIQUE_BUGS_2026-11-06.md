# Audit code — API kinedpoche

> **Date** : 06/11/2026 · **Périmètre** : `src/**` + Dockerfile + CI + contrats d'API avec `app-kinedpoche`
> **Légende** : 🔴 critique · 🟠 majeur · 🟡 mineur · 🧪 **vérifié** (lecture directe du code, sources des dépendances incluses — intégralement re-contrôlé le 06/11) · ⏱ signalé (non re-vérifié)
> Les bugs croisés API↔Front sont répétés ici avec le détail front dans `../app-kinedpoche/AUDIT_SECURITE_LOGIQUE_BUGS_2026-11-06.md`.

## ✅ Statut des correctifs — session du 06/11/2026

Correctifs appliqués et **committés** : `974d8d0` (sécurité : mass-assignment, tokens, autorisations) et `e60f640` (robustesse : rate limiting, erreurs globales, config). Vérification : `npm run build` (tsc) **0 erreur** ; smoke test exécution du rate limiter (2 PASS → 429 `Trop de requêtes` à dépasser ; IP distinctes indépendantes).

| ID | Statut | Détails |
|---|---|---|
| C1 mass-assignment POST /api/contract | ✅ **patché** (`974d8d0`) | `id`/`token` retirés du schéma éditable ; `id`+`token` → délégation au chemin update contrôlé ; `id` seul → **400** ; token généré serveur |
| C2 mass-assignment send-contract | ✅ **patché** (`974d8d0`) | whitelist explicite des champs ; token **consommé pour l'auth**, jamais persisté ; lien email via `FRONTEND_URL` ou première entrée `CORS_ORIGIN` |
| C3 crash `list-ids` | ✅ **patché** (`e60f640`) | `JSON.parse` défensif, validation `[id, token]`, null-safe, retour 400/500 JSON |
| C4 throw `validators()` | ✅ **fermé sans code** | garde conservée (inoffensible — déclassé 🟡 lors de la vérification) |
| C5 relais email | ✅ **patché (partiel)** (`e60f640`) | rate limit `send-contract` 10/h/IP, `report-bug` 5/h/IP, filtrage MIME. ⏳ **Reste à décider** : exiger le JWT (risque de casser le flux patient sans session) et/ou CAPTCHA |
| C6 collision de tokens | ✅ **patché** (`974d8d0`) | token généré après `save()` avec l'id réel. ⏳ Index unique recommandé — migration non créée volontairement (elle ferait échouer le boot si des doublons existent déjà en base) |
| C7 autorisation par token seul | ✅ **patché** (`974d8d0`) | `update` : token obligatoire + contrôle de propriété si JWT + **whitelist patient** (17 champs substitut uniquement — jamais les champs du kiné ni `token`/`user`) ; `delete` : propriétaire (JWT) ou token (`?token=` ou body) |
| 🟠 `MODE` vs `NODE_ENV` | ✅ **patché** (`e60f640`) | stack traces ne sont plus exposées en prod |
| 🟠 delete inopérant | ✅ **patché** (`974d8d0`) | fonctionne pour le propriétaire JWT ; le flux invité devra passer `?token=` (côté front) |
| 🟠 rate limiting absent | ✅ **patché** (`e60f640`) | limiter mémoire sans dépendance (auth 20/15 min, contracts 60/min) |
| 🟠 erreurs multer HTML / double `express.json` / `GET /` fuite / `urlencoded` sans limite | ✅ **patché** (`e60f640`) | handler d'erreurs global JSON ; parsing centralisé ; healthcheck neutre |
| 🟠 filtrage extension seulement | ✅ **patché** (`974d8d0`) | extension **+ MIME** |
| 🟠 `FRONTEND_URL` manquant | ✅ **patché** (fallback code) + ⏳ propser `FRONTEND_URL` dans le compose racine si souhaité | fallback = 1ʳᵉ entrée `CORS_ORIGIN` |
| 🟠 helmet | ⏳ **non fait** | dépendance non ajoutée (hors réseau) ; en-têtes `X-Content-Type-Options`/`X-Frame-Options`/`Referrer-Policy` manuels en place (`e60f640`) |
| 🟠 CI sans `local-dir` / index unique / arrêt gracieux | ⏳ / ⏳ / ✅ ci-dessus | CI à éditer dans `.github/workflows` ; index : cf. C6 |
| 🟡 `status` fantôme, double json, LIKE non échappé, `generateRandomNumber`, `==` list-ids, urlencoded, mot de passe < 8, typage `string\|number` | ✅ **patché** (`974d8d0` + `e60f640`) | — |
| 🟡 register en PATCH, `orderNumber` requis, logs synchrones | ⏳ **volontairement inchangés** | contrat front / décision métier / coût de refactor |

**Non corrigé (hors périmètre API)** : endpoint fantôme `/contract/signature` (appel côté front), nginx/CSP (repo front).


## Synthèse

| | 🔴 | 🟠 | 🟡 |
|---|---|---|---|
| Sécurité / autorisation | 5 | 5 | 4 |
| Robustesse / logique | 1 | 7 | 10 |

**Corrections de la passe de vérification** : l'ancien C4 « throw dans `validators()` » est **déclassé** (throw de `sanitizeNumber` inatteignable dans les flux actuels — garde défensive morte) ; le crash réel reste C3. Le mass-assignment relationnel dans MailController s'exprime par `{ "user": { "id": N } }` (mappé TypeORM), pas par `userId` plat. 4 items passés de ⏱ à 🧪.

**Priorité 1** : mass-assignment sur les routes publiques (lire/écrire les contrats d'autrui). **Priorité 2** : crash serveur en 1 requête (`list-ids`). **Priorité 3** : fermer le relais email anonyme. Détail en fin de fichier.

---

## 🔴 Critique

### C1. Mass-assignment sur `POST /api/contract` — écrasement de n'importe quel contrat 🧪
- **`src/routes/contract.ts`** : `POST /` → `contractController.create` ; **`src/routes/public.ts`** : liste `POST /api/contract` comme **publique** (pas de JWT).
- **`src/controllers/ContractController.ts` (~l.95-108)** : `contractValidationPattern` accepte **`id`** (`string|number`) et **`token`** dans le body → `getRepo(Contract).create({ ...validator.data })` → `save()`.
- **Pourquoi c'est un problème** : vérifié dans TypeORM 0.3.21 (`persistence/SubjectDatabaseEntityLoader.js` + `SubjectExecutor.executeUpdateOperations` → `manager.update(target, identifier, partialEntity)`) : quand l'entité soumise porte un `id` **existant en base**, `save()` exécute un **UPDATE** de cette ligne. Un anonyme envoie `{"id": 42, "replacedName": "…", "substituteSignatureDataUrl": "…", "token": "…"}` → le contrat n°42 est réécrit (y compris ses signatures) et la réponse 201 renvoie l'objet complet **avec son token**. Lecture + usurpation de contrat à distance, sans authentification.
- **Fix** : retirer `id` et `token` du pattern de validation ; rendre la réservation/création réservée au JWT ; ne jamais accepter de surcharger `token` à la création ; si un id est fourni → rejeter (400) au lieu de créer.

### C2. Mass-assignment via `POST /api/mail/send-contract` (route publique) 🧪
- **`src/controllers/MailController.ts` — `createOrLoadContract`** : `contractRepo.create({ token: jwt.sign(...), isPublic: true, ...contractData })` où `contractData = JSON.parse(body.contractData)` **sans aucun schéma de validation**. Le client contrôle `id`, `token`, `userId`, `isPublic` et toute colonne.
- **Vérification complémentaire** : le client contrôle `id`, `token`, et le champ relationnel `user` **sous forme objet** (`{ "user": { "id": N } }`) — un objet relationnel partiel est mappé vers la FK par TypeORM à l'insertion ; `userId` plat n'est pas un nom de propriété mappé sur l'entité (colonne FK accessible via la relation uniquement).
- **Pourquoi** : même sémantique `save()` que C1 (avec `id` seul présent → UPDATE d'un contrat arbitraire et récupération du nouveau token dans la réponse `creatingContract`). Permet aussi d'attacher un contrat à n'importe quel utilisateur via l'objet relationnel.
- **Fix** : whitelist stricte des champs autorisés dans `contractData` (mapper explicitement, champ par champ) ; ignorer `id`/`token`/`user` venant du client.

### C3. Crash serveur en une requête — `POST /api/contract/list-ids` 🧪
- **`src/controllers/ContractController.ts` — `listFromIDS`** : `JSON.parse(req.body.ids)` **sans `try/catch`** (body `{}` ou JSON invalide → SyntaxError → unhandledRejection → **fatal sur Node ≥15**) ; puis `contract.token` sur le résultat `null` d'un `findOne` → TypeError, même effet. Route **publique** (`public.ts`).
- **Fix** : `try/catch` global, valider que chaque élément est bien `[id, token]`, gérer `contract === null`, et sortir du whitelist public ou protéger par JWT.

### C4. ~~Throw non catché dans `validators()`~~ — **déclassé après vérification** 🟡
- **Vérification** : `sanitizeNumber()` (BaseController) n'est appelé que lorsque `validateSingleType('number')` a déjà validé la valeur (string parseable via `parseFloat` + `isFinite`, ou number) — le `throw` est une **garde défensive en code mort** dans les flux actuels, pas un vecteur de crash. Le vrai crash reste C3.
- **Fix (qualité)** : conserver en garde défensive ou faire retourner une erreur de validation à `validators()`.

### C5. Relais email anonyme (phishing depuis le domaine légitime) 🧪
- **`src/controllers/MailController.ts` — `sendContract`** : non authentifié (`public.ts`), `to` arbitraire, `body` arbitraire, pièce jointe validée sur l'**extension** uniquement (`src/multerUpload.ts:7` — pas de contrôle MIME/contenu). Un attaquant peut envoyer des emails de phishing depuis la mailbox officielle du service vers n'importe quelle adresse, sans limite de débit.
- **Fix** : exiger le JWT, rate-limit par IP/compte, valider MIME réel du fichier, restreindre `to` au patient du contrat transmis, considérer un CAPTCHA si le flux patient sans compte existe.

### C6. Token de contrat : collision (créés à la même seconde = identiques) 🧪
- **`src/controllers/ContractController.ts:95`** : `jwt.sign({ contractId: contract.id })` est généré **avant** le `save()` → `contractId: undefined`. Vérifié dans `jsonwebtoken/sign.js:185` (`iat = Math.floor(Date.now()/1000)`) : deux contrats créés dans la même seconde → **JWT byte-identiques**. Le flux « signer via lien email » peut servir le **mauvais contrat** ; les contrôles par token (`update`, `delete`, `list-ids`, `send-contract`) deviennent interchangeables entre contrats.
- Même schéma dans **`MailController.createOrLoadContract`** (`jwt.sign({ contractId: contractData?.id })`).
- **Fix** : sauvegarder d'abord (obtenir l'id), générer le token avec le vrai id puis sauvegarder le token (ou utiliser un UUID opaque côté serveur). Vérifier l'unicité (index unique sur `token`).

### C7. Autorisation par simple possession du token — le patient peut tout réécrire 🧪
- **`update()`** : aucun contrôle de propriété via la relation `user` ; seule égalité de `contract.token`. Le patient qui ouvre le lien email possède le token complet → il peut **lire** (`get-by-token`, publique) **et réécrire tout le contrat** : signatures du kiné, dates, emails, et même le champ `token` lui-même (il est dans le schéma de validation → remplaçable).
- **Conséquence croisée** : combiné à C6, un token de même seconde permet de modifier le contrat d'un autre patient.
- **Fix** : séparer les autorisations — propriétaire kiné (JWT + relation `user`), patient (token ⇒ uniquement champs `substituteSignatureDataUrl` + champs signés, jamais `token`/`user`).

---

## 🟠 Majeur

### Sécurité
- **🧪 `Controller.isDevelopment` utilise `MODE` au lieu de `NODE_ENV`** (`src/controllers/BaseController.ts`) : tout le reste du projet utilise `NODE_ENV` ; le Dockerfile prod pose `NODE_ENV=production` mais jamais `MODE` → `isDevelopment = true` en production → **stack traces / détails d'erreurs exposés aux clients** sur tous les endpoints (`...(this.isDevelopment && { details })`).
- **🧪 `DELETE /api/contract/:id` inopérant** (`src/controllers/ContractController.ts` — `delete`) : lit `token` dans `req.params` alors que la route n'expose que `:id` ; le front (`../app-kinedpoche/src/services/contract.service.ts:53`) n'envoie aucun token → **401 systématique, personne ne peut supprimer un contrat**.
- **🧪 Endpoint fantôme** : le front appelle `GET /contract/signature` (`contract.service.ts:38`) — **aucune route correspondante** dans l'API → 404 toujours (fonctionnalité manquante ou code mort).
- **⏱ Suppression par token possédé** : si le bug ci-dessus est corrigé tel quel, le patient lié par email pourrait détruire le contrat (il connaît le token). Définir qui a le droit de supprimer (kiné uniquement).

### Auth & robustesse
- **🧪 Aucun rate limiting partout** (`express-rate-limit` absent des deps `package.json`, aucun middleware dans `app.ts` — grep vérifié) : brute-force sur `POST /api/auth` (30 jours de validité de token, pas de révocabilité), spam sur `send-contract` (C5) et `report-bug` (15 PJ × 20 MB en RAM par requête, relance vers la mailbox admin).
- **🧪 `express.json` à 20 MB sur des routes publiques** (`src/routes/index.ts` + contract/auth routers) : amplification mémoire/CPU anonyme (parse de 20 MB sans authentification).
- **🧪 Filtrage pièces jointes sur extension uniquement** (`src/multerUpload.ts` : `file.originalname`) — vérifié par lecture : contournable par renommage ; `isValidFile` ne vérifie que `buffer.length > 0`.
- **🧪 Erreurs multer non interceptées** : aucun middleware d'erreur dans `app.ts`/routes (vérifié) → `LIMIT_FILE_SIZE` et rejets du filtre tombent sur le handler par défaut d'Express → réponse HTML 500/400 au lieu de JSON propre.

### Config / infra
- **🧪 `GET /` renvoie `CORS_ORIGIN` publiquement** (`src/routes/index.ts`) : fuite de configuration sans authentification.
- **🧪 `FRONTEND_URL` jamais défini** (docker-compose racine — non passé au service `api`) et lien généré en **http** (`MailController.prepareMailOptions` : `http://${process.env.FRONTEND_URL}?signe-back=…`) → liens des emails de signature cassés (`http://undefined?signe-back=…`) et sans TLS.
- **🧪 Pas de `helmet`** (absent des deps) ni de logging de requêtes ; pas d'arrêt gracieux (aucun handler SIGTERM dans `app.ts`).
- **🧪 CI API** (`.github/workflows/action.yml`) : `FTP-Deploy-Action` **sans `local-dir`** (workflow lu) → pousse le dépôt entier par FTP au lieu du build ; pas d'étape de lint/test.
- **🧪 Colonne `token` sans index unique** (migration initiale lue : varchar nu) : rien n'empêche deux contrats de partager un token (cf. C6).

---

## 🟡 Mineur

- **🧪 `register` déclenché par `PATCH /api/auth`** : sémantique anormale (POST attendu) — cohérent entre front/API mais surprenant et source d'erreurs futures.
- **🧪 `register` **exige** `orderNumber`/`department`/`bornLocation` (required) alors que les colonnes sont `nullable`** : un kiné sans n° d'ordre ne peut pas s'inscrire (à confirmer métier). Le message d'erreur 400 n'est pas structuré pour le front.
- **🧪 `status` déstructuré sans être dans le schéma** (`AuthController.register`) : variable fantôme, `create({ status: undefined })`.
- **🧪 `search`** : `Like('%'+query+'%')` sans échappement de `%`/`_` (jokers utilisateur) ; pas d'injection (paramétré TypeORM) mais résultats trompeurs possibles.
- **🧪 Double `express.json()`** redondant : posé dans `setRoutes` **et** sur chaque sous-router.
- **🧪 Typage incohérent** : `replacedOrderDepartmentNumber` = `string|number` dans le schéma de validation et `integer` en base, forcé `Number` dans le mailer — valider le type à un seul endroit.
- **🧪 `buildContractData` (MailController) : dates/numéros invalides supprimés silencieusement** (`delete field` — vérifié par lecture) au lieu de renvoyer une 400.
- **🧪 `listFromIDS`** : comparaison `==` (non stricte, non constant-time) sur le token — code lu ; types `[string,string]` réels envoyés par le front vs `[number,string]` annoncés.
- **🧪 `generateRandomNumber`** (`src/utils/auth.util.ts`) : **aucun usage dans tout le repo** (grep vérifié : défini, jamais référencé) + récursion sans plafond → code mort à supprimer.
- **🧪 `User.isPublic` jamais alimenté ni lu** (grep vérifié — seuls `contract.isPublic` et la méthode `JWTMiddleware.isPublic` sont utilisés) : champ fantôme.
- **🧪 `report-bug`** : `express.urlencoded()` sans limite explicite ; 15 × 20 MB = 300 MB RAM potentiel par requête anonyme (limites multer vérifiées).
- **🧪 Logs synchrones** (`src/utils/Logger.ts`, `appendFileSync` — vérifié) sur chaque erreur (bloque l'event loop sous charge).
- **🧪 nginx** (`../app-kinedpoche/nginx-spa.conf` — lu : aucune directive CSP / `X-Content-Type-Options` / `HSTS`).
- **→ Nginx/CI front** : détaillés dans `../app-kinedpoche/AUDIT_SECURITE_LOGIQUE_BUGS_2026-11-06.md`.

---

## Ce qui est sain

- SQL paramétré partout (TypeORM) — pas d'injection SQL constatée.
- bcrypt 10 rounds ; messages de login génériques (pas d'énumération de comptes) ; `login`/`me` excluent `password` des réponses.
- CORS en liste blanche explicite en prod (fallback `*` uniquement si `CORS_ORIGIN` absent) ; pas de cookies → pas de surface CSRF classique.
- Secrets hors git (`.env` ignoré, logs non commités) ; image prod API en `USER node`.

---

## Plan de correction recommandé (rayon d'impact décroissant)

1. **C1+C2** : retirer `id`/`token` des schémas, whitelist de `contractData`, créer sous JWT. (Quelques lignes, ferme la principale faille.)
2. **C3** : `try/catch` + validation sur `list-ids`. (Stabilité du process.)
3. **C5** : JWT + rate-limit sur le mailer. *(Indispensable avant mise en prod.)*
4. **C6+C7** : token généré après save (ou UUID) + modèle d'autorisation séparé kiné/patient.
5. **🟠** : fixer `MODE`→`NODE_ENV`, `delete` (token par body/query + contrôle propriétaire), `FRONTEND_URL` dans docker-compose, retirer `CORS_ORIGIN` du `GET /`, helmet+rate-limit.
6. **🟡** : nettoyage code mort & cosmétique.

*Généré par audit agent — chaque finding re-contrôlé contre le code le 06/11/2026 (sources des dépendances incluses). Un finding précédemment surestimé (C4) a été déclassé à cette occasion.*
