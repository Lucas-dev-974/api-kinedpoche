import { Application, NextFunction, Request, Response } from "express";
import express from "express";
import AuthRouter from "./auth";
import ContractRouter from "./contract";
import MailRouter from "./mail";
import { Logger } from "../utils/Logger";
import { authLimiter, contractLimiter } from "../middleware/rateLimit";

const MAX_JSON_BODY_SIZE = "20mb";

export function setRoutes(app: Application): void {
  // Healthcheck minimal — aucune configuration divulguée.
  app.get("/", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "api-kinedpoche" });
  });

  app.use("/api/mail", MailRouter);

  app.use("/api/auth", express.json({ limit: MAX_JSON_BODY_SIZE }), authLimiter, AuthRouter);
  app.use("/api/contract", express.json({ limit: MAX_JSON_BODY_SIZE }), contractLimiter, ContractRouter);

  // Gestion d'erreurs globale : réponses JSON propres (multer, body-parser,
  // contrôleurs), jamais de stack en production.
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (process.env.NODE_ENV !== "production") {
      console.error("❌ Erreur non gérée :", err);
    }
    Logger.write("Errors", Logger.getContentErrorMessage(err));

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
