# Audit propreté & structure — API kinedpoche

> **Date** : 07/11/2026 · **Périmètre** : `src/**` + package.json/tsconfig + CI + `test/` + README/ConceptionRefactor + Dockerfile/nodemon.
> **Nature** : propreté du code et reste-à-faire. **PAS un audit sécurité** (cf. `AUDIT_SECURITE_LOGIQUE_BUGS_2026-11-06.md` — les correctifs C1-C7 sont appliqués et committés).
> **Légende** : 🧪 vérifié (lecture directe / commande exécutée — audit agent + re-vérification des findings structurants par un second passage : whitelist publique, migration, entités, deps, imports — tous confirmés). `npx tsc --noEmit` : **0 erreur** (exécuté 2× indépendamment) · `git status` propre · zéro TODO/FIXME dans `src/`.
> **Sain d'emblée** : `build/` présent sur disque mais **non tracké** et ignoré ; `src/logs/*.log` non trackés ; `generateRandomNumber` **supprimé** ; arrêt gracieux SIGTERM/SIGINT en place (`app.ts:126-132`).

---

## ✅ Statut des correctifs — vague de remédiation du 07/11/2026

Vérification : `npx tsc --noEmit` **0 erreur** (exécuté 2× indépendamment) · `npm run build` ✓ · serveur conteneur redémarré et répond (POST /api/auth → 400 propre) · migration exécutée au boot (`ALTER TABLE "user" DROP COLUMN "isPublic"` — vérifié dans les logs). Commits : `1491b36` (refactor), `1b9656e` (migration), `c17c488` (deps/config), `ab2479f` (CI).

| Finding | Statut | Détails |
|---|---|---|
| 🔴 A1 doc contredit le code | ✅ **patché** (docs) | README réécrit (routes réelles, env, architecture, scripts) ; bannière « HISTORIQUE » sur `ConceptionRefactor.md` (les points corrigés y sont listés) |
| 🔴 A2 aucune chaîne de test | 🟡 **partiel** (`c17c488`) | Script `npm run test:live` ajouté (suite maison live) ; pas branché CI (les tests exigent l'API démarrée) ; migration vitest ⏳ |
| 🔴 A3 deps mal placées/mortes | ✅ **patché** (`c17c488`) | axios + @types → devDependencies ; validatorjs supprimé ; @types/node@16 (doublon) retiré ; lock resynchronisé (`npm install`) |
| 🔴 A4 CI FTP sans local-dir | ✅ **patché** (`ab2479f`) | `local-dir: build` ; pas d'étape test (volontaire) |
| 🔴 A5 tsconfig es5 / pas de strict | 🟡 **partiel** (`c17c488`) | target/lib es2022 ✓ ; `strict:true` testé : **55 erreurs** (initialisateurs d'entités, cors/nodemailer non typés) → revert, à activer en étape dédiée |
| 🟠 A6 User.isPublic | ✅ **patché** (`1b9656e`) | Colonne retirée + migration `1794023200000-DropUserIsPublic` (up/down) exécutée au boot |
| 🟠 A7 whitelists dupliquées | ✅ **patché** (`1491b36`) | `contractFields.ts` : `CONTRACT_MUTABLE_FIELDS` (26) + `PATIENT_MUTABLE_FIELDS` dérivée — égalité champ par champ vérifiée avant fusion (17 = 26 − 9 `replaced*`) |
| 🟠 A8 token/secret dupliqués | ✅ **patché** (`1491b36`) | `generateContractToken` centralisé ; `JWT_PRIVATE` lu à un seul endroit |
| 🟠 A9 blocs d'erreur copiés ×10 | ✅ **patché** (`1491b36`) | `handleError` protégé dans BaseController ; `detailedError` construit en dev uniquement ; formes de réponse préservées |
| 🟠 A10 getRepo non générique | ✅ **patché** (`1491b36`) | `getRepo<T>` ; les 5 casts `as unknown as Repository` supprimés |
| 🟠 A11 logs synchrones | ✅ **patché** (`1491b36`) | `fs.promises.appendFile(…).catch(console.error)` ; classe `logger` → `Logger` (25 call sites) |
| 🟠 A12 typage Date qui ment | ⏳ **reporté** | Typer `Date` changerait le type de colonne inféré par TypeORM (varchar → timestamp) — pas purement typé ; à faire avec une vraie migration de colonne |
| 🟠 A13 code mort / imports | ✅ **patché** (`1491b36`) | `createSchema`, `src/types/index.ts`, import `express-serve-static-core` → `express` |
| 🟡 messages/brand/magie | ✅ **patché** (`1491b36`) | « s'est produite / réessayer / adresse renseignée », « Kiné de poche » ×2, « [Kiné de poche] », `SALT_ROUNDS`/`TOKEN_EXPIRES_IN`/`MAX_JSON_BODY_SIZE`/`GRACEFUL_SHUTDOWN_TIMEOUT_MS` |

**Écarts de comportement** : uniquement ceux demandés (messages FR, colonne isPublic, logs async, `res.send`→`res.json` dans AuthController — corps identique). Note préexistante constatée au passage : `GET /` (healthcheck « neutre » de l'audit sécurité) est en réalité **derrière le JWT** (`JWTMiddleware` monté avant `setRoutes`, `/` absent de la whitelist publique) → route injoignable sans token depuis e60f640 ; à trancher (l'ajouter à `public.ts` ou la supprimer).

---

## 🔴 Structurant

### A1. Documentation contredit le code sur des points de sécurité corrigés 🧪
- **`README.md:1-54`** : template NPM d'origine (« My Express App », `cd my-express-app`, « Index controller » inexistant) — aucune route, variable d'env, migration ni script documenté. Un nouveau développeur ne peut rien en tirer.
- **`ConceptionRefactor.md:33, 113, 166`** : décrit encore le token généré **avant** le `save()` (aujourd'hui après — `ContractController.ts:91-94, 166-168`), le `token` dans `contractValidationPattern` (retiré par le fix C1) et le champ `contractAuth` (aujourd'hui `contractData` + whitelist `MailController.ts:228-255`). **La doc contredit des correctifs de sécurité récents.**
- **Fix** : réécrire le README (routes réelles de `src/routes/`, `JWT_PRIVATE`/`DB_*`/`SMTP_*`/`CORS_ORIGIN`, scripts, Docker) ; marquer ConceptionRefactor « historique, supplanté par l'audit du 06/11 » ou le mettre à jour.

### A2. Aucune chaîne de test 🧪
- **`package.json`** : pas de script `"test"`, aucune devDependency de test. `test/` (7 fichiers, ~2 700 lignes, **trackés**) est une suite maison axios en JS brut — non branchée à npm ni à la CI. `nodemon.json:4` ignore `*.spec.ts`… qui n'existent pas.
- **Fix** : brancher `runLiveTest.js` (`"test:live": "node test/runLiveTest.js"`) ou migrer vers vitest ; sinon déplacer dans `docs/`.

### A3. Dépendances mal placées / mortes 🧪 (grep : zéro import dans `src/`)
- **`axios` en `dependencies`** de prod alors qu'il n'est utilisé que dans `test/` → **installé dans l'image Docker prod** (`npm ci --omit=dev`, Dockerfile:24).
- **`validatorjs` : jamais importé** (src ni test) — dépendance morte.
- `@types/jsonwebtoken`, `@types/multer`, `@types/node@22` en `dependencies` (et `@types/node@16` **aussi** en devDependencies — doublon).
- **Fix** : basculer axios/@types en devDependencies, supprimer `validatorjs` et le doublon `@types/node`.

### A4. CI FTP pousse le dépôt entier 🧪
- **`.github/workflows/action.yml:32-38`** : `FTP-Deploy-Action` toujours **sans `local-dir`** (item ⏳ confirmé ouvert) → déploie le repo complet par FTP au lieu de `build/` ; pas d'étape test/lint.
- **Fix** : `local-dir: build` + étape de test une fois A2 branché.

### A5. `tsconfig.json:3-4` : `target: es5`, `lib: [es5, es6]`, **pas de `strict`** 🧪
- Pour une app Node 22 (Dockerfile). Le code compile, mais l'absence de strict laisse passer les `any` implicites — les casts `as unknown as Repository<Contract>` (`ContractController.ts:153`) en sont la conséquence directe.
- **Fix** : `target: es2022` + activer `strict` progressivement.

---

## 🟠 Notable

### A6. `User.isPublic` : colonne morte 🧪
**`User.ts:44`** — jamais alimentée ni lue (seul `Contract.isPublic` est écrit, `MailController.ts:333` ; `JWTMiddleware.isPublic` est un autre symbole). Item 🟡 de l'audit sécurité **toujours ouvert**. Fix : retirer la colonne (migration) ou l'alimenter.

### A7. Duplication des listes de champs de contrat 🧪
**`ContractController.ts:15-33` (`PATIENT_MUTABLE_FIELDS`) ≈ `MailController.ts:228-255` (`ALLOWED_FIELDS`)** : deux whitelists de ~26 champs quasi identiques — tout nouveau champ devra être ajouté aux deux endroits sous peine de dérive (le premier bloc `startDate…substituteAdress` est déjà un copier-coller). Fix : constante partagée (`contractFields.ts`).

### A8. Token + secret JWT dupliqués 🧪
Génération du token inline dans `MailController.ts:338` vs méthode `generateContractToken` (`ContractController.ts:92-94`) ; le secret `JWT_PRIVATE` est lu à 3 endroits (`auth.util.ts:15` + les deux contrôleurs). Fix : réutiliser la méthode + centraliser le secret dans `UtilsAuthentication`.

### A9. Blocs d'erreur copiés-collés, handler global jamais alimenté 🧪
Le pattern `logger.write(...) + res.status(500).json(...isDevelopment && {details})` est dupliqué dans ~10 méthodes alors qu'un handler d'erreurs global existe (`routes/index.ts:22-36`) — **aucun `next(err)` ne l'alimente**. Dans `AuthController.ts:68-73, 131-136`, `detailedError` est construit même hors dev. Fix : erreurs typées vers le handler global, ou `handleError(res, error, contexte)`.

### A10. `getRepo(entity: any)` force 5 casts `as unknown` 🧪
**`dataSource.ts:24-26`** — non générique → `as unknown as Repository<Contract>` × 4 dans ContractController + 1 dans MailController. Fix : `getRepo<T>(entity: EntityTarget<T>): Repository<T>` supprime tous les casts.

### A11. Logs synchrones (⏳ confirmé ouvert) 🧪
**`Logger.ts:14`** : `fs.appendFileSync` à chaque erreur — bloque l'event loop sous charge. La classe s'appelle en plus `logger` (minuscule). Fix : `fs.promises.appendFile` + rename.

### A12. Typages d'entités qui mentent 🧪
**`Contract.ts:20, 32`** : `percentReturnToSubstituteBeforeDate: string` et `doneAt: string` **validés** comme dates (`ContractController.ts:46`), convertis en `Date` (`MailController.ts:268-293`), puis assignés dans des champs typés `string`. TypeORM tolère ; le type déclaré ne reflète pas ce qui est persisté. Fix : typer `Date` partout.

### A13. Divers code mort / imports 🧪
- **`BaseController.ts:274-290`** : `createSchema()` exporté, jamais appelé.
- **`types/index.ts:1-7`** : stubs `Request`/`Response` vides, jamais importés — fichier mort.
- **`ContractController.ts:2`** : `import { Request, Response } from "express-serve-static-core"` — chemin interne de la dépendance (tous les autres fichiers importent d'`"express"`).

---

## 🟡 Cosmétique

- **Messages utilisateurs fautifs** 🧪 : « Une erreur c'est produite, veuillez réesayer » (`AuthController.ts:78, 140` — la forme correcte existe en :173) ; « l'addresse email que vous avez renseigner existe déjà, veuillez vous connecté » (`:100`). → « s'est produite / réessayer / adresse / renseignée / connecter ».
- **Marque incohérente** 🧪 : « Kiné de **poce** » (`MailController.ts:155, 367`) et « **[Rempkiné]** » (`:157`) — deux noms de produit différents dans la même app. Unifier.
- **Nommage de champs** 🧪 : `Adress` vs `Address` (`replacedProfessionnalAddress` — avec « Professionnal » à double n) ; `replacedOrderDepartement` (fr) à côté de `replacedOrderDepartmentNumber` (en) dans la même paire. **Toute correction impose migration + front → à figer maintenant ou documenter.**
- **Nommage hétérogène** : `listFromIDS` (majuscules) ; `test/APITestDataUser.js` vs `test/ApiTestDataContract.js` ; `routes/public.ts` n'est pas un router mais un tableau de whitelist → `publicRoutes.ts` serait plus honnête.
- **`package.json:8`** : `"start": "ts-node src/app.ts"` utilise ts-node (devDep) alors que `main` pointe `build/app.js` et que le Dockerfile prod lance `node build/app.js`.
- **Magic numbers** : `saltRound = 10`, `expiresIn: "30d"` (`auth.util.ts:14, 26`), `limit: "20mb"` dupliqué (`routes/index.ts:17-18`), timeout `5000` (`app.ts:129`) — le pattern `const MAX_…` existe déjà ailleurs, l'appliquer.
- **`Contract.ts:3-4`** : ligne vide résiduelle entre `@Entity()` et la classe.

---

## (a) Reste à faire — items ⏳ de l'audit du 06/11, re-vérifiés aujourd'hui

| Item | Statut vérifié |
|---|---|
| C5 : JWT/CAPTCHA sur `send-contract` | ⏳ **OUVERT** — toujours dans la whitelist publique (`public.ts`), aucun check JWT dans MailController. Le rate-limit 10/h est en place (`mail.ts:12`). |
| C6 : index unique sur `contract.token` | ⏳ **OUVERT** — migration l.9 : `token character varying` **sans UNIQUE** (contrairement à `email`/`orderNumber` de `user`). |
| `helmet` | ⏳ **OUVERT** — absent des deps ; headers manuels en place (`app.ts:78-83`). |
| CI sans `local-dir` | ⏳ **OUVERT** — cf. A4. |
| `register` en PATCH | ⏳ **VOLONTAIRE** — contrat front (`routes/auth.ts:7`). |
| `orderNumber` requis / colonne nullable | ⏳ **DÉCISION MÉTIER** — `AuthController.ts:21` `required: true` vs `User.ts:15-16` nullable. |
| Logs synchrones | ⏳ **OUVERT** — cf. A11. |
| Code mort `generateRandomNumber` | ✅ **RÉGLÉ** — supprimé (grep vide). |
| Code mort `User.isPublic` | ⏳ **TOUJOURS LÀ** — cf. A6. |
| `FRONTEND_URL` dans le compose racine | ℹ️ côté infra — le fallback code est en place (`MailController.ts:360`) ; la variable n'est pas passée au service `api` dans le compose racine. |

## (b) Verdict global

Repo **fonctionnellement propre** : `tsc` 0 erreur, statut git propre, aucun artefact de build committé, aucun TODO traînant, correctifs sécurité intégrés et documentés. La dette se concentre sur trois fronts : **documentation obsolète/template** (README + ConceptionRefactor contredisent le code sur des points corrigés), **absence totale de chaîne de test** (suite maison non branchée, CI sans test), et **nommage/typage non maîtrisés** (`Adress`/`Departement`, casts `as unknown`, whitelists dupliquées) qui coûteront cher si le schéma fige.

**Priorité recommandée** : (1) README + `local-dir` CI — quick wins ; (2) whitelist de champs partagée (A7) + `getRepo<T>` (A10) — avant tout ajout de champ ; (3) `strict` + deps ; les items ⏳ métier (PATCH, orderNumber, JWT mail) restent des décisions produit à trancher.

*Généré par audit agent (double passage : findings d'un premier agent audit, re-vérifiés — whitelist, migration, entités, deps, imports, tsc — par le second). Fichier non committé — à relire avant commit.*
