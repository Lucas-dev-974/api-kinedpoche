# Kiné de poche — API (api-kinedpoche)

API **Express + TypeScript + TypeORM (PostgreSQL)** du projet Kiné de poche : comptes kinésithérapeutes, contrats de remplacement (création/lecture/suppression), génération de tokens de signature par email, envoi de PDF signés et signalement de bugs.

> Ce repo fait partie du monorepo kinedpoche : l'app web vit dans `../app-kinedpoche`, l'orchestration Docker dans `../docker-compose.yml`.

## Stack

- Express 4, TypeScript (target es2022), TypeORM 0.3 + PostgreSQL (schéma par **migrations auto-run au boot**)
- Auth JWT (`Authorization: Bearer`), bcrypt, rate limiting mémoire (auth 20/15 min, contracts 60/min, send-contract 10/h, report-bug 5/h)
- Nodemailer (démarrage **gracieux** : sans config SMTP, l'API boote et `/api/mail/*` répond 503)
- Multer (PDF contrat ≤ 20 MB ; screenshots de bug ≤ 15 × 20 MB, filtrage extension + MIME)

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | nodemon (ts-node) |
| `npm start` | `node build/app.js` (build de prod) |
| `npm run build` | tsc → `build/` |
| `npm run test:live` | suite maison `test/runLiveTest.js` — **nécessite l'API démarrée** (non branchée CI) |

Le stack complet (api + web + postgres) se lance depuis la racine du monorepo :

```bash
docker compose up -d                    # dev (api:3001)
docker compose --profile prod up -d --build   # prod (api:3002)
```

## Routes

| Méthode | Chemin | Auth | Rôle |
|---|---|---|---|
| PATCH | `/api/auth` | publique | inscription (kiné) |
| POST | `/api/auth` | publique | connexion |
| GET | `/api/auth/me` | JWT | profil courant |
| POST | `/api/contract` | publique* | création (ou délégation update si `id`+`token`) |
| PATCH | `/api/contract` | publique* | mise à jour (token obligatoire ; whitelist patient 17 champs) |
| GET | `/api/contract` | JWT | liste du propriétaire |
| GET | `/api/contract/search?q=` | JWT | recherche (noms/emails) |
| POST | `/api/contract/list-ids` | publique* | lecture par `[id, token]` (flux invité) |
| GET | `/api/contract/get-by-token?token=` | publique* | lecture par lien email |
| DELETE | `/api/contract/:id` | JWT ou `?token=` | suppression |
| POST | `/api/mail/send-contract` | publique* | envoi du PDF + création/refresh du contrat |
| POST | `/api/mail/report-bug` | publique | signalement de bug avec captures |

\* « publique » = pas de JWT, mais contrôlée par token de contrat et/ou rate limiting (cf. `src/routes/public.ts`, whitelist des routes sans JWT).

## Configuration

Variables d'environnement (fournies par le compose racine, cf. `../docker-compose.yml`) :

| Variable | Rôle |
|---|---|
| `PORT` | port d'écoute (3001 en dev) |
| `NODE_ENV` | `production` = pas de stack traces dans les réponses |
| `DB_HOST` `DB_PORT` `DB_USERNAME` `DB_PASSWORD` `DB_DATABASE` | PostgreSQL |
| `JWT_PRIVATE` | secret des JWT de session **et** des tokens de contrat |
| `CORS_ORIGIN` | liste d'origines autorisées (séparées par des virgules) |
| `SMTP_HOST` `SMTP_PORT` `MAIL_USER` `MAIL_PASS` | service email (optionnel — 503 sinon) |
| `MAIL_BUG_REPORT_TO` | destinataire des signalements de bug |
| `FRONTEND_URL` | base du lien de signature dans les emails (fallback : 1ʳᵉ entrée `CORS_ORIGIN`) |

## Architecture rapide

```
src/
├── app.ts                boot (CORS, sécurité headers, arrêt gracieux SIGTERM)
├── dataSource.ts         TypeORM + getRepo<T> générique
├── routes/               index (mount + erreur globale) + auth/contract/mail + public (whitelist)
├── controllers/          Auth/Contract/Mail + BaseController (validation, handleError) +
│                         contractFields.ts (whitelists anti mass-assignment)
├── database/entity/      User, Contract
├── migrations/           schéma par migrations (auto-run au boot)
├── middleware/           JWTMiddleware, rateLimit (en mémoire)
└── utils/                auth.util (bcrypt/JWT/constantes), Logger (appendFile async)
```

## Sécurité — état connu

Les audits `AUDIT_SECURITE_LOGIQUE_BUGS_2026-11-06.md` (sécurité/logique) et `AUDIT_PROPRETE_STRUCTURE_2026-11-07.md` (propreté) décrivent l'état vérifié du code, leurs correctifs et les points volontairement laissés ouverts (C5 JWT/CAPTCHA sur le mail, C6 index unique sur `token`, `helmet`).
