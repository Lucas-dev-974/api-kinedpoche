export interface ValidationRule {
    type: 'string' | 'email' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'enum' | string; // string pour supporter les types multiples comme "string|number"
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    values?: string[]; // Pour le type 'enum', liste des valeurs autorisées
    custom?: (value: any) => boolean;
}

export interface ValidationSchema {
    [key: string]: ValidationRule;
}

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    data?: any;
}

import { Response } from "express";
import { Logger } from "../utils/Logger";

export abstract class Controller {

    public isDevelopment: boolean = process.env.NODE_ENV !== 'production';

    constructor() { }

    /**
     * Bloc d'erreur 500 factorisé : log systématique + réponse JSON dont les
     * détails ne sont inclus qu'en développement. `detailsValue` (différé)
     * n'est construit qu'en dev — plus de `detailedError` assemblé hors dev.
     */
    protected handleError(
        res: Response,
        error: unknown,
        context: string,
        message: string,
        options?: {
            detailsKey?: string;
            detailsValue?: (error: unknown) => unknown;
        }
    ): void {
        Logger.write(context, Logger.getContentErrorMessage(error));
        const detailsKey = options?.detailsKey ?? "details";
        const detailsValue = options?.detailsValue ? options.detailsValue(error) : (error as Error).message;
        res.status(500).json({
            error: message,
            ...(this.isDevelopment && { [detailsKey]: detailsValue }),
        });
    }

    public validators(data: any, schema: ValidationSchema): ValidationResult {
        const errors: string[] = [];
        const sanitizedData: any = {};

        // Vérifier chaque champ du schéma
        for (const [fieldName, rule] of Object.entries(schema)) {
            const value = data[fieldName];

            // Vérifier si le champ est requis
            if (rule.required && (value === undefined || value === null || value === '')) {
                errors.push(`Le champ '${fieldName}' est requis`);
                continue;
            }

            // Si le champ n'est pas requis et n'est pas présent (undefined, null ou chaîne vide), passer outre toute la vérification
            if (!rule.required && (value === undefined || value === null || value === '')) {
                continue;
            }

            // Valider le type
            const typeValidation = this.validateType(value, rule.type);
            if (!typeValidation.isValid) {
                errors.push(`Le champ '${fieldName}' doit être de type '${rule.type}'`);
                continue;
            }

            // Détecter le type réel de la valeur
            const actualType = typeValidation.actualType || this.detectActualType(value);

            // Valider la longueur pour les chaînes (si le type inclut string)
            if (actualType === 'string' && typeof value === 'string') {
                if (rule.minLength && value.length < rule.minLength) {
                    errors.push(`Le champ '${fieldName}' doit avoir au moins ${rule.minLength} caractères`);
                }
                if (rule.maxLength && value.length > rule.maxLength) {
                    errors.push(`Le champ '${fieldName}' ne peut pas dépasser ${rule.maxLength} caractères`);
                }
            }

            // Valider le format email
            if (rule.type === 'email' && !this.isValidEmail(value)) {
                errors.push(`Le champ '${fieldName}' doit être un email valide`);
            }

            // Valider le pattern regex (seulement pour les strings)
            if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
                errors.push(`Le champ '${fieldName}' ne respecte pas le format attendu`);
            }

            // Valider l'enum (vérifier que la valeur fait partie de la liste autorisée)
            if (rule.type === 'enum') {
                if (!rule.values || !Array.isArray(rule.values)) {
                    errors.push(`Le champ '${fieldName}' a une configuration enum invalide (valeurs manquantes)`);
                } else if (!rule.values.includes(value)) {
                    errors.push(`Le champ '${fieldName}' doit être l'une des valeurs suivantes: ${rule.values.join(', ')}`);
                }
            }

            // Validation personnalisée
            if (rule.custom && !rule.custom(value)) {
                errors.push(`Le champ '${fieldName}' ne respecte pas la validation personnalisée`);
            }

            // Si toutes les validations passent pour ce champ, sanitizer et stocker la valeur
            const hasErrorForThisField = errors.some(error => error.includes(fieldName));
            if (!hasErrorForThisField) {
                sanitizedData[fieldName] = this.sanitizeValue(value, rule.type, actualType);
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            data: sanitizedData
        };
    }

    private validateType(value: any, expectedType: string): { isValid: boolean; actualType?: string } {
        // Si le type contient un |, c'est un type multiple
        if (expectedType.includes('|')) {
            const types = expectedType.split('|').map(t => t.trim());
            for (const type of types) {
                const result = this.validateSingleType(value, type);
                if (result.isValid) {
                    return { isValid: true, actualType: type };
                }
            }
            return { isValid: false };
        }

        // Type simple
        return this.validateSingleType(value, expectedType);
    }

    private validateSingleType(value: any, expectedType: string): { isValid: boolean; actualType?: string } {
        switch (expectedType) {
            case 'string':
                return { isValid: typeof value === 'string', actualType: 'string' };
            case 'email':
                return { isValid: typeof value === 'string' && this.isValidEmail(value), actualType: 'email' };
            case 'number':
                // Si c'est déjà un number valide
                if (typeof value === 'number' && !isNaN(value)) {
                    return { isValid: true, actualType: 'number' };
                }
                // Si c'est une string, essayer de la convertir en number
                if (typeof value === 'string') {
                    const parsed = parseFloat(value);
                    if (!isNaN(parsed) && isFinite(parsed)) {
                        return { isValid: true, actualType: 'number' };
                    }
                }
                return { isValid: false };
            case 'boolean':
                return { isValid: typeof value === 'boolean', actualType: 'boolean' };
            case 'date':
                return { isValid: value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value))), actualType: 'date' };
            case 'array':
                return { isValid: Array.isArray(value), actualType: 'array' };
            case 'object':
                return { isValid: typeof value === 'object' && value !== null && !Array.isArray(value), actualType: 'object' };
            case 'enum':
                // Pour enum, on valide juste que c'est une string, la validation des valeurs se fait ailleurs
                return { isValid: typeof value === 'string', actualType: 'enum' };
            default:
                return { isValid: true };
        }
    }

    private detectActualType(value: any): string {
        if (typeof value === 'string') return 'string';
        if (typeof value === 'number') return 'number';
        if (typeof value === 'boolean') return 'boolean';
        if (value instanceof Date) return 'date';
        if (Array.isArray(value)) return 'array';
        if (typeof value === 'object' && value !== null) return 'object';
        return 'unknown';
    }

    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    private sanitizeValue(value: any, type: string, actualType?: string): any {
        // Si on a un type multiple, utiliser le type réel détecté
        const typeToUse = actualType || (type.includes('|') ? this.detectActualType(value) : type);

        switch (typeToUse) {
            case 'string':
                return this.sanitizeString(value);
            case 'email':
                return this.sanitizeEmail(value);
            case 'number':
                return this.sanitizeNumber(value);
            case 'boolean':
                return this.sanitizeBoolean(value);
            case 'date':
                return this.sanitizeDate(value);
            case 'array':
                return this.sanitizeArray(value);
            case 'object':
                return this.sanitizeObject(value);
            case 'enum':
                // Pour enum, on sanitize comme une string (trim)
                return typeof value === 'string' ? this.sanitizeString(value) : value;
            default:
                return value;
        }
    }

    private sanitizeString(value: string): string {
        if (typeof value !== 'string') return value;

        // TypeORM utilise des paramètres préparés, donc la sanitization SQL n'est pas nécessaire
        // On se contente de trimmer les espaces en début et fin
        return value.trim();
    }

    private sanitizeEmail(value: string): string {
        if (typeof value !== 'string') return value;

        // Nettoyer l'email et vérifier qu'il est valide
        const sanitized = this.sanitizeString(value).toLowerCase();
        return this.isValidEmail(sanitized) ? sanitized : value;
    }

    private sanitizeNumber(value: any): number {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
            const parsed = parseFloat(value);
            if (isNaN(parsed)) {
                throw new Error(`Impossible de convertir '${value}' en nombre`);
            }
            return parsed;
        }
        throw new Error(`Type invalide pour la conversion en nombre: ${typeof value}`);
    }

    private sanitizeBoolean(value: any): boolean {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
            const lower = value.toLowerCase().trim();
            return lower === 'true' || lower === '1' || lower === 'yes';
        }
        if (typeof value === 'number') {
            return value !== 0;
        }
        return false;
    }

    private sanitizeDate(value: any): Date | string {
        if (value instanceof Date) return value;
        if (typeof value === 'string') {
            const date = new Date(value);
            return isNaN(date.getTime()) ? value : date;
        }
        return value;
    }

    private sanitizeArray(value: any): any[] {
        if (!Array.isArray(value)) return [];
        return value.map(item => {
            if (typeof item === 'string') {
                return this.sanitizeString(item);
            }
            return item;
        });
    }

    private sanitizeObject(value: any): any {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            return value;
        }

        const sanitized: any = {};
        for (const [key, val] of Object.entries(value)) {
            if (typeof val === 'string') {
                sanitized[key] = this.sanitizeString(val);
            } else {
                sanitized[key] = val;
            }
        }
        return sanitized;
    }
}