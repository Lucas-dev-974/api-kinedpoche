import { NextFunction, Request, Response } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
}

const MAX_TRACKED_IPS = 10_000;

/**
 * Rate limiter minimal en mémoire (mono-processus, sans dépendance).
 * Objectif : freiner le brute-force login, le relais d'emails et le spam
 * de contrats / signalements sur les routes publiques.
 */
export function rateLimit(options: RateLimitOptions): (req: Request, res: Response, next: NextFunction) => void {
  const { windowMs, max, message } = options;
  const buckets = new Map<string, Bucket>();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip ?? "unknown";

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    // Purge occasionnelle pour éviter la croissance indéfinie de la map.
    if (buckets.size > MAX_TRACKED_IPS) {
      buckets.forEach((bucketValue, bucketKey) => {
        if (bucketValue.resetAt <= now) {
          buckets.delete(bucketKey);
        }
      });
    }

    if (bucket.count > max) {
      res.set("Retry-After", Math.ceil((bucket.resetAt - now) / 1000).toString());
      return res.status(429).json({ error: message ?? "Trop de requêtes, réessayez plus tard." });
    }

    next();
  };
}

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Trop de tentatives d'authentification, réessayez dans quelques minutes.",
});
export const contractLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: "Trop de requêtes, réessayez dans un instant.",
});
export const sendContractLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: "Trop d'emails envoyés depuis cette adresse, réessayez plus tard.",
});
export const bugReportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "Trop de signalements, réessayez plus tard.",
});
