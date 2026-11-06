import { Application, NextFunction, Request, Response } from "express";
import express from "express";
import AuthRouter from "./auth";
import ContractRouter from "./contract";
import MailRouter from "./mail";
import { logger } from "../utils/Logger";
import { authLimiter, contractLimiter } from "../middleware/rateLimit";

export function setRoutes(app: Application): void {
  // Healthcheck minimal — aucune configuration divulguée.
  app.get("/", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "api-kinedpoche" });
  });

  app.use("/api/mail", MailRouter);

  app.use("/api/auth", express.json({ limit: "20mb" }), authLimiter, AuthRouter);
  app.use("/api/contract", express.json({ limit: "20mb" }), contractLimiter, ContractRouter);

  // Gestion d'erreurs globale : réponses JSON propres (multer, body-parser,
  // contrôleurs), jamais de stack en production.
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (process.env.NODE_ENV !== "production") {
      console.error("❌ Erreur non gérée :", err);
    }
    logger.write("Errors", logger.getContentErrorMessage(err));

    const status =
      typeof err?.status === "number"
        ? err.status
        : typeof err?.statusCode === "number"
          ? err.statusCode
          : 500;
    const message = status >= 500 ? "Erreur interne du serveur" : (err?.message || "Requête invalide");
    res.status(status).json({ error: message });
  });
}
