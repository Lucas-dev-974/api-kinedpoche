import nodemailer, { Transporter, SendMailOptions } from "nodemailer";
import { Request, Response } from "express";
import { Controller } from "./BaseController";
import { Logger } from "../utils/Logger";
import { getRepo } from "../dataSource";
import { Contract } from "../database/entity/Contract";
import { CONTRACT_MUTABLE_FIELDS } from "./contractFields";
import { UtilsAuthentication } from "../utils/auth.util";

interface MailConfig {
    host: string;
    port: number;
    secure: boolean;
    auth: {
        user: string;
        pass: string;
    };
}

interface SendContractRequest {
    to: string;
    from: string;
    body?: string;
    contractData: Partial<Contract> | "";
}

interface ReportBugRequest {
    reportContent: string;
}

const BUG_SCREENSHOT_MIMES = new Set(["image/png", "image/jpeg", "image/jpg"]);

class MailController extends Controller {
    private transporter: Transporter | null;

    constructor() {
        super();
        // Différé : le serveur démarre même sans configuration SMTP ; /api/mail/* renverra 503.
        this.transporter = this.hasSmtpConfig() ? this.initializeTransporter() : null;
        if (!this.transporter) {
            Logger.write("Mail", "SMTP non configuré (SMTP_HOST, SMTP_PORT, MAIL_USER, MAIL_PASS) — /api/mail/* renverra 503.");
        }
    }

    private hasSmtpConfig(): boolean {
        return !!(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.MAIL_USER && process.env.MAIL_PASS);
    }

    /** État du service e-mail, lisible par app.ts pour un log de boot honnête. */
    get mailEnabled(): boolean {
        return this.transporter !== null;
    }

    private initializeTransporter(): Transporter {
        if (!process.env.SMTP_HOST || !process.env.SMTP_PORT || !process.env.MAIL_USER || !process.env.MAIL_PASS) {
            throw new Error("Variables d'environnement SMTP manquantes. Vérifiez SMTP_HOST, SMTP_PORT, MAIL_USER et MAIL_PASS.");
        }

        const config: MailConfig = {
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT, 10),
            secure: true,
            auth: {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASS,
            },
        };

        if (isNaN(config.port)) {
            throw new Error("SMTP_PORT doit être un nombre valide.");
        }

        return nodemailer.createTransport(config);
    }

    public sendContract = async (req: Request, res: Response): Promise<void> => {
        try {
            const validationResult = this.validateRequestSendContract(req);
            if (validationResult.error || !validationResult.data) {
                res.status(400).json(validationResult.error);
                return;
            }

            if (!this.transporter) {
                res.status(503).json({ error: "Service e-mail non configuré (variables SMTP_* manquantes)" });
                return;
            }

            try {
                const { contractData, claimedToken } = this.buildContractData(validationResult.data.contractData as string | undefined);
                const { contract, created } = await this.createOrLoadContract(contractData, claimedToken);

                const mailOptions = this.prepareMailOptions(validationResult.data, contract.token, req.file);
                const info = await this.transporter.sendMail(mailOptions);

                const creatingContractResponse = created ? { contract } : {};

                res.status(200).json({
                    message: "E-mail envoyé avec succès",
                    creatingContract: creatingContractResponse
                });
            } catch (error) {
                Logger.write("Mail", Logger.getContentErrorMessage(error));
                res.status(400).json({
                    error: "Erreur lors de l'envoi de l'e-mail",
                    ...(this.isDevelopment && { details: error instanceof Error ? error.message : 'Erreur inconnue' })
                });
                return;
            }
        } catch (error) {
            this.handleError(res, error, "Mail", "Erreur interne du serveur", {
                detailsValue: (e) => e instanceof Error ? e.message : "Erreur inconnue",
            });
        }
    }

    public reportBug = async (req: Request, res: Response): Promise<void> => {
        try {
            const validationResult = this.validateRequestReportBug(req);
            if (validationResult.error || !validationResult.data) {
                res.status(400).json(validationResult.error);
                return;
            }

            const files = req.files as Express.Multer.File[] | undefined;
            if (!files || files.length === 0) {
                res.status(400).json({ error: "Au moins une capture d'écran (PNG ou JPEG) est requise" });
                return;
            }

            const invalidFile = files.find((f) => !this.isBugScreenshotFile(f));
            if (invalidFile) {
                res.status(400).json({
                    error: "Seules les images PNG et JPEG sont acceptées pour les captures d'écran",
                    detail: invalidFile.originalname,
                });
                return;
            }

            const corrupted = files.find((f) => !this.isValidFile(f));
            if (corrupted) {
                res.status(400).json({ error: "Un fichier reçu est vide ou corrompu" });
                return;
            }

            const to = process.env.MAIL_BUG_REPORT_TO || process.env.MAIL_USER;
            if (!to) {
                res.status(500).json({ error: "Destinataire des rapports de bug non configuré (MAIL_BUG_REPORT_TO ou MAIL_USER)" });
                return;
            }

            try {
                const mailOptions: SendMailOptions = {
                    from: `"Kiné de poche (bug report)" <${process.env.MAIL_USER}>`,
                    to,
                    subject: "[Kiné de poche] Signalement de bug",
                    text: validationResult.data.reportContent,
                    attachments: files.map((file, index) => ({
                        filename: file.originalname || `capture-${index + 1}.png`,
                        content: file.buffer,
                        contentType: file.mimetype,
                    })),
                };

                if (!this.transporter) {
                    res.status(503).json({ error: "Service e-mail non configuré (variables SMTP_* manquantes)" });
                    return;
                }
                await this.transporter.sendMail(mailOptions);
                res.status(200).json({ message: "Signalement envoyé avec succès" });
            } catch (error) {
                Logger.write("Mail", Logger.getContentErrorMessage(error));
                res.status(400).json({
                    error: "Erreur lors de l'envoi du signalement",
                    ...(this.isDevelopment && { details: error instanceof Error ? error.message : "Erreur inconnue" }),
                });
            }
        } catch (error) {
            this.handleError(res, error, "Mail", "Erreur interne du serveur", {
                detailsValue: (e) => e instanceof Error ? e.message : "Erreur inconnue",
            });
        }
    };

    private validateRequestReportBug = (req: Request): { data?: ReportBugRequest; error?: any } => {
        const validator = this.validators(req.body, {
            reportContent: { type: "string", required: true, minLength: 1 },
        });

        if (validator.errors.length > 0) {
            return { error: validator.errors };
        }

        return { data: validator.data as ReportBugRequest };
    }

    private isBugScreenshotFile(file: Express.Multer.File): boolean {
        const mime = (file.mimetype || "").toLowerCase();
        return BUG_SCREENSHOT_MIMES.has(mime);
    }

    private validateRequestSendContract(req: Request): { data?: SendContractRequest; error?: any } {
        const validator = this.validators(req.body, {
            to: { type: "email", required: true },
            body: { type: "string", required: false },
            contractData: { type: "string", required: false }
        });

        if (validator.errors.length > 0) {
            return { error: validator.errors };
        }

        return { data: validator.data as SendContractRequest };
    }

    private buildContractData(rawContractData?: string): { contractData: Partial<Contract>; claimedToken?: string } {
        if (!rawContractData) {
            throw new Error("Données de contrat manquantes");
        }

        const parsedData: Partial<Contract> = JSON.parse(rawContractData);

        // Anti mass-assignment : whitelist explicite — le client ne décide
        // jamais de `id`, `token`, `user` (relation) ni des colonnes système.
        const ALLOWED_FIELDS = CONTRACT_MUTABLE_FIELDS;

        const contractData: Partial<Contract> = {};
        for (const field of ALLOWED_FIELDS) {
            const value = (parsedData as any)[field];
            if (value !== undefined) {
                (contractData as any)[field] = value;
            }
        }

        // Le token est consommé pour AUTHENTIFIER la requête, jamais persisté tel quel.
        const claimedToken = typeof (parsedData as any).token === "string" ? (parsedData as any).token : undefined;

        const dateFields: (keyof Contract)[] = [
            "startDate",
            "endDate",
            "percentReturnToSubstituteBeforeDate",
            "doneAt",
            "replacedBirthday",
            "substituteBirthday",
        ];

        for (const field of dateFields) {
            const value = (contractData as any)[field];

            if (value === "" || value === null || value === undefined) {
                delete (contractData as any)[field];
                continue;
            }

            if (typeof value === "string") {
                const d = new Date(value);
                if (isNaN(d.getTime())) {
                    delete (contractData as any)[field];
                } else {
                    (contractData as any)[field] = d;
                }
            }
        }

        const numericFields: (keyof Contract)[] = [
            "percentReturnToSubstitute",
            "nonInstallationRadius",
            "replacedOrderDepartmentNumber",
            "substituteOrderDepartmentNumber",
        ];

        for (const field of numericFields) {
            const value = (contractData as any)[field];

            if (value === "" || value === null || value === undefined) {
                delete (contractData as any)[field];
                continue;
            }

            const n = typeof value === "string" ? Number(value) : value;

            if (typeof n !== "number" || isNaN(n)) {
                delete (contractData as any)[field];
            } else {
                (contractData as any)[field] = n;
            }
        }

        return { contractData, claimedToken };
    }

    /**
     * - Sans `id` : création pure, token généré SERVEUR après la sauvegarde
     *   (dérivé de l'id réel — plus de collision entre contrats créés à la même seconde).
     * - Avec `id` + token : chargement du contrat existant, token du client
     *   vérifié contre la valeur en base (auth) — jamais réécrit.
     */
    private async createOrLoadContract(contractData: Partial<Contract>, claimedToken?: string): Promise<{ contract: Contract, created: boolean }> {
        const contractRepo = getRepo(Contract);

        if (!contractData.id) {
            const contract = contractRepo.create({
                isPublic: true,
                ...contractData
            });

            const saved = await contractRepo.save(contract);
            saved.token = UtilsAuthentication.generateContractToken(saved.id);
            const result = await contractRepo.save(saved);

            return { contract: result, created: true };
        }

        const existingContract = await contractRepo.findOne({ where: { id: contractData.id } });

        if (!existingContract) {
            throw new Error("Contrat introuvable");
        }

        if (!existingContract.token || existingContract.token !== claimedToken) {
            throw new Error("Vous n'êtes pas autorisé à envoyer cet e-mail");
        }

        return { contract: existingContract, created: false };
    }

    private prepareMailOptions(data: SendContractRequest, contractToken: string, file?: Express.Multer.File): SendMailOptions {
        // Lien du front : FRONTEND_URL en priorité, sinon première entrée de
        // CORS_ORIGIN (elle contient déjà le schéma), sinon fallback de dev.
        let frontBase = process.env.FRONTEND_URL || (process.env.CORS_ORIGIN || "").split(",")[0]?.trim() || "localhost:5173";
        if (!/^https?:\/\//i.test(frontBase)) {
            frontBase = `http://${frontBase}`;
        }
        const signeBackLink = `${frontBase}?signe-back=${contractToken}`;

        const mailOptions: SendMailOptions = {
            from: `"Kiné de poche" <${process.env.MAIL_USER}>`,
            to: data.to,
            subject: "Vous avez reçu un contrat de remplacement",
            text: "Contrat de remplacement proposé. Vous trouverez le contrat en pièce jointe.\n\n" + (data.body || "") + "\n\nPour signer le contrat, cliquez sur le lien suivant : " + signeBackLink,
        };

        if (file) {
            this.logFileInfo(file);

            if (!this.isValidFile(file)) {
                throw new Error("Le fichier reçu est vide ou corrompu");
            }

            mailOptions.attachments = [{
                filename: file.originalname || 'contract.pdf',
                content: file.buffer,
                contentType: file.mimetype || 'application/pdf'
            }];
        }

        return mailOptions;
    }

    private logFileInfo(file: Express.Multer.File): void {
        if (process.env.NODE_ENV === 'development') {
            Logger.write("Mail", `File received: ${file.originalname}, Size: ${file.buffer?.length || 0} bytes, Type: ${file.mimetype}`);
        }
    }

    private isValidFile(file: Express.Multer.File): boolean {
        return !!(file.buffer && file.buffer.length > 0);
    }

}
export const mailController = new MailController()
