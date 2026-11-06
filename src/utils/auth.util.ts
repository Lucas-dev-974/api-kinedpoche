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
  static saltRound = 10;
  static secret = process.env.JWT_PRIVATE as string;

  static async hash(password: string) {
    return await bcrypt.hash(password, this.saltRound);
  }

  static async check(password: string, hashedPassword: string) {
    return await bcrypt.compare(password, hashedPassword);
  }

  static generateToken(user: UserTokenInformationType) {
    return jwt.sign(user, this.secret, { expiresIn: "30d" });
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
