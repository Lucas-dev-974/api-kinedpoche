import multer, { FileFilterCallback } from "multer";
import path from "path";
import { Request } from "express";

const ALLOWED_FILE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".pdf"];
const ALLOWED_MIMES = new Set(["application/pdf", "image/png", "image/jpeg"]);
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const fileFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = (file.mimetype || "").split(";")[0].trim().toLowerCase();

  if (!ALLOWED_FILE_EXTENSIONS.includes(ext)) {
    cb(new Error(`Type de fichier non autorisé. Extensions autorisées: ${ALLOWED_FILE_EXTENSIONS.join(", ")}`));
    return;
  }

  // Le mimetype déclaré doit correspondre à la whitelist : un fichier renommé
  // (ex. binaire en .pdf) est refusé au lieu d'être transmis.
  if (mime && !ALLOWED_MIMES.has(mime)) {
    cb(new Error("Type MIME non autorisé."));
    return;
  }

  cb(null, true);
};

export const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});
