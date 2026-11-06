import express, { Application } from "express";
import dotenv from "dotenv";
import cors from "cors";

import { JWTMiddleware } from "./middleware/JWTMiddleware";
import { AppDataSource } from "./dataSource";
import { setRoutes } from "./routes/index";
import { logger } from "./utils/Logger";
import { mailController } from "./controllers/MailController";

// Configuration des variables d'environnement
dotenv.config();

interface CorsOptions {
  origin: string | string[] | ((origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void);
  methods: string | string[];
  allowedHeaders: string | string[];
  optionsSuccessStatus: number;
  credentials?: boolean;
}

class AppConfig {
  private static readonly DEFAULT_PORT = 3001;

  /** Origin header is never sent with a trailing slash; env values often mistakenly include one. */
  private static normalizeCorsOriginEntry(value: string): string {
    return value.trim().replace(/\/+$/, "");
  }

  static createCorsOptions(): CorsOptions {
    // En production, utiliser la variable d'environnement CORS_ORIGIN
    // Si non définie, utiliser "*" pour le développement
    const corsOrigin = process.env.CORS_ORIGIN;

    let origin: string | string[] | ((origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void);

    if (corsOrigin) {
      // Si plusieurs origines sont séparées par des virgules
      if (corsOrigin.includes(',')) {
        origin = corsOrigin.split(',').map(o => AppConfig.normalizeCorsOriginEntry(o));
      } else {
        origin = AppConfig.normalizeCorsOriginEntry(corsOrigin);
      }
    } else {
      // En développement, permettre toutes les origines
      origin = "*";
    }

    return {
      origin: origin,
      methods: "DELETE,PUT,PATCH,GET,POST,OPTIONS",
      allowedHeaders: "Content-Type,Authorization",
      optionsSuccessStatus: 200,
    };
  }

  static getPort(): number {
    return parseInt(process.env.PORT || this.DEFAULT_PORT.toString());
  }
}

class App {
  private app: Application;

  constructor() {
    this.app = express();
    this.setupMiddleware();
  }

  private setupMiddleware(): void {
    const corsOptions = AppConfig.createCorsOptions();

    // Derrière un reverse-proxy en prod : utiliser X-Forwarded-For pour
    // que le rate limiter key sur l'IP réelle du client.
    this.app.set("trust proxy", 1);

    // En-têtes de sécurité de base (léger, sans dépendance).
    this.app.use((_req, res, next) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("Referrer-Policy", "no-referrer");
      next();
    });

    // Log de la configuration CORS pour le débogage
    const corsOrigin = process.env.CORS_ORIGIN || "*";
    logger.write("App", `Configuration CORS - CORS_ORIGIN: ${corsOrigin}\n`);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🔧 CORS Origin configuré: ${corsOrigin}`);
    }

    // Middleware CORS - doit être en premier, avant tout autre middleware
    this.app.use(cors(corsOptions));

    // JWT Middleware - les requêtes OPTIONS sont déjà gérées par CORS et passent dans le middleware JWT
    this.app.use(JWTMiddleware.checkBearerToken);
  }

  public async start(): Promise<void> {
    try {
      // Initialisation de la base de données
      await AppDataSource.initialize();
      logger.write("App", "Base de données initialisée avec succès\n");

      // Configuration des routes
      setRoutes(this.app);

      // Démarrage du serveur
      const port = AppConfig.getPort();
      const server = this.app.listen(port, () => {
        const mailLogMessage = mailController.mailEnabled
          ? "Service d'envoi d'emails activé"
          : "Service d'envoi d'emails non configuré — /api/mail/* renverra 503";
        logger.write("App", `Serveur démarré sur http://localhost:${port}\n`);
        logger.write("App", `${mailLogMessage}\n`);
        logger.write("App", "Gestion des fichiers configurée (max: 20MB)\n");
        // Afficher aussi dans la console pour le développement
        if (process.env.NODE_ENV !== 'production') {
          console.log(`🚀 Serveur démarré sur http://localhost:${port}`);
          console.log(`📧 ${mailLogMessage}`);
          console.log(`📁 Gestion des fichiers configurée (max: 20MB)`);
        }
      });

      // Arrêt gracieux (docker stop, déploie, Ctrl+C) : fermer les connexions.
      const shutdown = (signal: string) => {
        logger.write("App", `Arrêt gracieux (${signal})…\n`);
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 5000).unref();
      };
      process.on("SIGTERM", () => shutdown("SIGTERM"));
      process.on("SIGINT", () => shutdown("SIGINT"));

    } catch (error) {
      logger.write("App", logger.getContentErrorMessage(error));
      console.error("❌ Erreur lors du démarrage de l'application:", error);
      process.exit(1);
    }
  }
}

const app = new App();
app.start();
