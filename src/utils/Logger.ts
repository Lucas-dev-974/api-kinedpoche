import path from "path";
import fs from "fs";

export class Logger {
  static write(filename: string, content: string) {
    const logsDir = path.join(__dirname, "../logs");

    // S'assurer que le dossier de logs existe (utile en production après compilation)
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const logFilePath = path.join(logsDir, `${filename}.log`);
    // Écriture asynchrone : ne bloque jamais l'event loop. Un échec d'écriture
    // est tracé en console mais ne doit jamais faire crasher le serveur.
    fs.promises.appendFile(logFilePath, content, { encoding: "utf8" }).catch((err) => {
      console.error(`Échec d'écriture du log ${logFilePath} :`, err);
    });
  }

  static getContentErrorMessage(error: any) {
    const detailedError = {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: (error as any).code || "UNKNOWN_ERROR",
    };

    return (
      "------------------------------------" +
      detailedError.name +
      "------------------------------------\n" +
      detailedError.message +
      "\n" +
      detailedError.stack +
      "\n------------------------------------------------------------------------"
    );
  }
}
