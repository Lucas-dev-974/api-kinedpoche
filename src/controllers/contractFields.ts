import { Contract } from "../database/entity/Contract";

/**
 * Liste unique des champs de contrat mutables par le client (whitelist anti
 * mass-assignment). `id`, `token`, `user` (relation) et les colonnes système
 * n'en font volontairement PAS partie : ils sont extraits/gérés à part.
 *
 * Ordre historique préservé (champ par champ identique aux anciennes
 * `ALLOWED_FIELDS` de MailController et `PATIENT_MUTABLE_FIELDS` de
 * ContractController).
 */
export const CONTRACT_MUTABLE_FIELDS: (keyof Contract)[] = [
  "startDate",
  "endDate",
  "percentReturnToSubstitute",
  "percentReturnToSubstituteBeforeDate",
  "nonInstallationRadius",
  "conciliationCDOMK",
  "doneAtLocation",
  "doneAt",
  "replacedGender",
  "replacedEmail",
  "replacedName",
  "replacedBirthday",
  "replacedBirthdayLocation",
  "replacedOrderDepartement",
  "replacedOrderDepartmentNumber",
  "replacedProfessionnalAddress",
  "substituteGender",
  "substituteEmail",
  "substituteName",
  "substituteBirthday",
  "substituteBirthdayLocation",
  "substituteOrderDepartement",
  "substituteOrderDepartmentNumber",
  "substituteAdress",
  "replacedSignatureDataUrl",
  "substituteSignatureDataUrl",
];

/**
 * Champs que le patient (possesseur du token du lien e-mail) a le droit de
 * modifier : la liste complète MOINS les champs du kiné remplacé, qui ne sont
 * NEVER éditables via le flux patient.
 */
export const PATIENT_MUTABLE_FIELDS: (keyof Contract)[] = CONTRACT_MUTABLE_FIELDS.filter(
  (field) => !field.startsWith("replaced")
);
