import { Controller, ValidationSchema } from "./BaseController";
import { Request, Response } from "express-serve-static-core";
import { Contract } from "../database/entity/Contract";
import { User } from "../database/entity/User";
import { getRepo } from "../dataSource";
import { DeepPartial, Like, Repository } from "typeorm";
import { logger } from "../utils/Logger";
import jwt from "jsonwebtoken";

/**
 * Champs que le patient (possesseur du token du lien email) a le droit de modifier.
 * Les champs du kiné remplaçé, le token du contrat et la relation user
 * ne sont NEVER éditables via le flux patient.
 */
const PATIENT_MUTABLE_FIELDS: (keyof Contract)[] = [
  "startDate",
  "endDate",
  "percentReturnToSubstitute",
  "percentReturnToSubstituteBeforeDate",
  "nonInstallationRadius",
  "conciliationCDOMK",
  "doneAtLocation",
  "doneAt",
  "substituteGender",
  "substituteEmail",
  "substituteName",
  "substituteBirthday",
  "substituteBirthdayLocation",
  "substituteOrderDepartement",
  "substituteOrderDepartmentNumber",
  "substituteAdress",
  "substituteSignatureDataUrl",
];

class ContractController extends Controller {
  /**
   * Schéma des champs de payload acceptés.
   * `id` et `token` n'en font volontairement PAS partie en tant que champs
   * éditables : ils sont extraits à part (auth/patch) et jamais persistés
   * depuis le corps de la requête (anti mass-assignment).
   */
  contractValidationPattern: ValidationSchema = {
    startDate: { type: "string" },
    endDate: { type: "string" },
    percentReturnToSubstitute: { type: "number" },
    percentReturnToSubstituteBeforeDate: { type: "date" },
    nonInstallationRadius: { type: "number" },
    conciliationCDOMK: { type: "string" },
    doneAtLocation: { type: "string" },
    doneAt: { type: "date" },

    // ------------------- Replaced kinesitherapist -------------------
    replacedGender: { type: "enum", values: ["male", "female"] },
    replacedEmail: { type: "email" },
    replacedName: { type: "string" },
    replacedBirthday: { type: "date" },
    replacedBirthdayLocation: { type: "string" },
    replacedOrderDepartement: { type: "string" },
    replacedOrderDepartmentNumber: { type: "number" },
    replacedProfessionnalAddress: { type: "string" },

    // ------------------- Substitute kinesitherapist -------------------
    substituteGender: { type: "enum", values: ["male", "female"] },
    substituteEmail: { type: "email" },
    substituteName: { type: "string" },
    substituteBirthday: { type: "date" },
    substituteBirthdayLocation: { type: "string" },
    substituteOrderDepartement: { type: "string" },
    substituteOrderDepartmentNumber: { type: "number" },
    substituteAdress: { type: "string" },
    replacedSignatureDataUrl: { type: "string" },
    substituteSignatureDataUrl: { type: "string" },
  }

  /** Le token du contrat sert d'autorisation : validé, jamais réécrit par le client. */
  private contractTokenSchema: ValidationSchema = {
    token: { type: "string" },
  }

  private pickFields(data: Partial<Contract>, fields: (keyof Contract)[]): Omit<Partial<Contract>, "user"> {
    const patch: Partial<Contract> = {};
    for (const field of fields) {
      const value = (data as Record<string, unknown>)[field as string];
      if (value !== undefined) {
        (patch as Record<string, unknown>)[field as string] = value;
      }
    }
    return patch;
  }

  /** Génère le token APRÈS la sauvegarde, avec l'id réel de la ligne. */
  private generateContractToken = (contract: Contract) => {
    return jwt.sign({ contractId: contract.id }, process.env.JWT_PRIVATE as string);
  }

  public async list(req: Request, res: Response) {
    try {
      const user = await getRepo(User).findOne({
        where: { id: res.locals.user.id },
        relations: ["contracts"]
      });

      if (!user) {
        res.status(404).json({ error: "Utilisateur non trouvé." });
        return;
      }

      res.status(200).json(user.contracts || []);
    } catch (error) {
      logger.write("Contract", logger.getContentErrorMessage(error));
      res.status(500).json({
        error: "Erreur lors de la récupération des contrats.",
        ...(this.isDevelopment && { details: (error as Error).message })
      });
    }
  }

  /**
   * POST /api/contract
   * - sans `id` : création pure (id/token du client ignorés, token généré serveur).
   * - avec `id` **et** `token` : délégation au chemin de mise à jour contrôlé
   *   (auth par token + whitelist selon rôle) — la ligne existante n'est jamais
   *   réécrite aveuglément depuis le corps de la requête.
   * - avec `id` seul : 400 (anti mass-assignment).
   */
  public create = async (req: Request, res: Response) => {
    const validator = this.validators(req.body, this.contractValidationPattern)
    const tokenValidator = this.validators({ token: req.body?.token }, this.contractTokenSchema)
    const claimedToken = (tokenValidator.data as { token?: string }).token;

    if (validator.errors.length > 0 || tokenValidator.errors.length > 0) {
      return res.status(400).json({ error: [...validator.errors, ...tokenValidator.errors] });
    }

    try {
      const contractId = req.body?.id;
      // Un id fourni + un token : la ligne existe potentiellement → chemin de mise à jour strict.
      if (contractId !== undefined && contractId !== null && claimedToken) {
        return this.update(req, res);
      }
      // Un id sans token : non autorisé.
      if (contractId !== undefined && contractId !== null) {
        return res.status(400).json({ error: "La création ne peut pas fixer l'identifiant du contrat." });
      }

      const contractData = this.pickFields(
        validator.data as Partial<Contract>,
        Object.keys(this.contractValidationPattern) as (keyof Contract)[]
      );

      // getRepo() est typé Repository<ObjectLiteral> (paramètre `any` côté dataSource) :
      // on force le typage Contract pour que create()/save() soient corrects.
      const contractRepo = getRepo(Contract) as unknown as Repository<Contract>;
      const contract = contractRepo.create(contractData as unknown as DeepPartial<Contract>);

      if (res.locals.user) {
        const userRepository = getRepo(User) as unknown as Repository<User>;
        const user = await userRepository.findOneBy({ id: res.locals.user.id });
        if (!user) {
          return res.status(401).json({ error: "Token invalide, veuillez vous reconnecter." });
        }
        contract.user = user;
      }

      const saved = await contractRepo.save(contract);
      // Token dérivé de l'id réel : plus de collision entre contrats créés à la même seconde.
      saved.token = this.generateContractToken(saved);
      const result = await contractRepo.save(saved);

      res.status(201).json(result);
    } catch (error) {
      logger.write("Contract", logger.getContentErrorMessage(error));
      res.status(500).json({
        error: "Erreur lors de la création du contrat.",
        ...(this.isDevelopment && { details: (error as Error).message })
      });
    }
  }

  public update = async (req: Request, res: Response) => {
    const validator = this.validators(req.body, this.contractValidationPattern)
    const tokenValidator = this.validators({ token: req.body?.token }, this.contractTokenSchema)

    if (validator.errors.length > 0 || tokenValidator.errors.length > 0) {
      return res.status(400).json({ error: [...validator.errors, ...tokenValidator.errors] });
    }

    const contractData = validator.data as Partial<Contract>;
    const claimedToken = (tokenValidator.data as { token?: string }).token;

    try {
      if (!req.body?.id) {
        res.status(400).json({ error: "L'identifiant du contrat est requis." });
        return;
      }

      const contractId = typeof req.body.id === 'string' ? parseInt(req.body.id, 10) : req.body.id;
      if (isNaN(contractId)) {
        res.status(400).json({ error: "L'identifiant du contrat doit être un nombre valide." });
        return;
      }

      const contractRepo = getRepo(Contract) as unknown as Repository<Contract>;
      const contract = await contractRepo.findOne({
        where: { id: contractId }
      });

      if (!contract) {
        res.status(404).json({ error: "Contrat non trouvé." });
        return;
      }

      // Autorisation 1 : possession du token du contrat (validé, jamais réécrit).
      if (!contract.token || contract.token !== claimedToken) {
        res.status(401).json({ error: "Vous n'êtes pas autorisé à modifier ce contrat." });
        return;
      }

      // Autorisation 2 (si JWT) : contrôle de propriété.
      let allowedFields: (keyof Contract)[];
      if (res.locals.user) {
        const user = await getRepo(User).findOneBy({ id: res.locals.user.id });
        if (!user) {
          res.status(401).json({ error: "Token invalide, veuillez vous reconnecter." });
          return;
        }
        const contractOwnerId = (contract as unknown as { userId?: number | null }).userId;
        if (contractOwnerId !== null && contractOwnerId !== undefined && contractOwnerId !== user.id) {
          res.status(403).json({ error: "Vous n'êtes pas le propriétaire de ce contrat." });
          return;
        }
        // Propriétaire (ou contrat sans propriétaire) : tous les champs payload.
        allowedFields = Object.keys(this.contractValidationPattern) as (keyof Contract)[];
      } else {
        // Flux patient (lien email) : whitelist stricte — jamais les champs du kiné.
        allowedFields = PATIENT_MUTABLE_FIELDS;
      }

      const patch = this.pickFields(contractData, allowedFields);
      const updatedContract = contractRepo.merge(contract, patch);
      await contractRepo.save(updatedContract);

      res.status(200).json(updatedContract);
    } catch (error) {
      logger.write("Contract", logger.getContentErrorMessage(error));
      res.status(500).json({
        error: "Erreur lors de la mise à jour du contrat.",
        ...(this.isDevelopment && { details: (error as Error).message })
      });
    }
  }

  public delete = async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "L'identifiant du contrat est requis." });
    }

    const contractId = parseInt(id, 10);
    if (isNaN(contractId)) {
      return res.status(400).json({ error: "L'identifiant du contrat doit être un nombre valide." });
    }

    try {
      const contract = await getRepo(Contract).findOne({ where: { id: contractId } });

      if (!contract) {
        res.status(404).json({ error: "Contrat non trouvé." });
        return;
      }

      // Autorisation : propriétaire (JWT) OU possession du token du contrat
      // (?token=… en query ou champ token du body).
      const claimedToken = (req.query.token as string | undefined) || req.body?.token;
      const contractOwnerId = (contract as unknown as { userId?: number | null }).userId;
      const tokenIsValid = typeof claimedToken === "string" && contract.token === claimedToken;
      const isOwner = !!res.locals.user && contractOwnerId !== null && contractOwnerId !== undefined && contractOwnerId === res.locals.user.id;

      if (!isOwner && !tokenIsValid) {
        res.status(401).json({ error: "Vous n'êtes pas autorisé à supprimer ce contrat." });
        return;
      }

      await getRepo(Contract).remove(contract);
      res.status(200).json({ message: "Contrat supprimé avec succès." });
    } catch (error) {
      logger.write("Contract", logger.getContentErrorMessage(error));
      res.status(500).json({
        error: "Erreur lors de la suppression du contrat.",
        ...(this.isDevelopment && { details: (error as Error).message })
      });
    }
  }

  public search = async (req: Request, res: Response) => {
    const validator = this.validators(req.query, { q: { type: "string", required: false } });
    const query = validator.data?.q;

    const contractRepository = getRepo(Contract);
    const userRepository = getRepo(User);

    try {
      const user = await userRepository.findOneBy({
        id: res.locals.user.id,
      });

      if (!user) {
        res.status(404).json({ error: "Utilisateur non trouvé." });
        return;
      }

      let contracts = [];

      if (query && query !== "") {
        // Échapper les jokers LIKE (%) et _ pour éviter qu'un `%` tapé par
        // l'utilisateur ne transforme la recherche en balayage total.
        const escaped = String(query).replace(/([%_\\])/g, "\\$1");
        contracts = await contractRepository.find({
          where: [
            { user: user, replacedName: Like(`%${escaped}%`) },
            { user: user, substituteName: Like(`%${escaped}%`) },
          ],
        });
      } else {
        contracts = await contractRepository.find({
          where: { user: user },
        });
      }

      res.status(200).json(contracts);
    } catch (error) {
      logger.write("Contract", logger.getContentErrorMessage(error));
      res.status(500).json({
        error: "Erreur lors de la recherche de contrats.",
        ...(this.isDevelopment && { details: (error as Error).message })
      });
    }
  }

  /**
   * POST /api/contract/list-ids — flux de resynchronisation locale.
   * Corps : { "ids": "[[id, token], ...]" } — parsing défensif : jamais de crash (C3).
   */
  public listFromIDS = async (req: Request, res: Response) => {
    try {
      const { ids } = req.body ?? {};
      let parsed: unknown;
      try {
        parsed = typeof ids === "string" ? JSON.parse(ids) : ids;
      } catch {
        return res.status(400).json({ error: "Format des ids invalide." });
      }

      if (!Array.isArray(parsed)) {
        return res.status(400).json({ error: "Format des ids invalide : tableau attendu." });
      }

      const contracts: Contract[] = [];

      for (const entry of parsed) {
        if (!Array.isArray(entry)) continue;
        const [rawId, rawToken] = entry;
        if (rawId === undefined || rawId === null || typeof rawToken !== "string") continue;

        const contractId = typeof rawId === "number" ? rawId : parseInt(String(rawId), 10);
        if (Number.isNaN(contractId)) continue;

        const contract = await getRepo(Contract).findOne({ where: { id: contractId } });
        if (contract && String(contract.token) === String(rawToken)) {
          contracts.push(contract as Contract);
        }
      }

      return res.status(200).json(contracts);
    } catch (error) {
      logger.write("Contract", logger.getContentErrorMessage(error));
      return res.status(500).json({
        error: "Erreur lors de la récupération des contrats.",
        ...(this.isDevelopment && { details: (error as Error).message })
      });
    }
  }

  public getByToken = async (req: Request, res: Response) => {
    const { token } = req.query;
    try {
      const contract = await getRepo(Contract).findOne({ where: { token: token as string } });
      if (!contract) {
        return res.status(404).json({ error: "Contrat non trouvé." });
      }
      return res.status(200).json(contract);
    } catch (error) {
      logger.write("Contract", logger.getContentErrorMessage(error));
      res.status(500).json({
        error: "Erreur lors de la récupération du contrat.",
        ...(this.isDevelopment && { details: (error as Error).message })
      });
    }
  }

}

export const contractController = new ContractController();
