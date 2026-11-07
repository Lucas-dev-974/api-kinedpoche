import { Request } from "express";
import jwt, { TokenExpiredError } from "jsonwebtoken";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config();

export type UserTokenInformationType = {
  email: string;
  id: number;
};

export class UtilsAuthentication {
  static readonly SALT_ROUNDS = 10;
  static readonly TOKEN_EXPIRES_IN = "30d";
  static secret = process.env.JWT_PRIVATE as string;

  static async hash(password: string) {
    return await bcrypt.hash(password, this.SALT_ROUNDS);
  }

  static async check(password: string, hashedPassword: string) {
    return await bcrypt.compare(password, hashedPassword);
  }

  static generateToken(user: UserTokenInformationType) {
    return jwt.sign(user, this.secret, { expiresIn: this.TOKEN_EXPIRES_IN });
  }

  /**
   * Token d'autorisation d'un contrat (lien e-mail patient). Généré SERVEUR
   * après la sauvegarde, dérivé de l'id réel de la ligne — jamais réécrit par
   * le client. `JWT_PRIVATE` n'est lu qu'ici, via `this.secret`.
   */
  static generateContractToken(contractId: number) {
    return jwt.sign({ contractId }, this.secret);
  }

  static checkToken(token: string) {
    try {
      return jwt.verify(token, this.secret);
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        return "Token expiré, veuillez vous reconnecter.";
      }
      return false;
    }
  }

  static getBearerToken(req: Request): string {
    return req.headers.authorization?.split(" ")[1] ?? "";
  }
}
