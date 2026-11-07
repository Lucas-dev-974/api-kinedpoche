import { UtilsAuthentication } from "../utils/auth.util";
import { User } from "../database/entity/User";
import { Request, Response } from "express";
import { getRepo } from "../dataSource";
import { Controller, ValidationSchema } from "./BaseController";

class AuthController extends Controller {
  authValidationPattern: ValidationSchema = {
    email: { type: "email", required: true },
    password: { type: "string", required: true },
  }

  registerValidationPattern: ValidationSchema = {
    email: { type: "email", required: true },
    fullname: { type: "string", required: true },
    password: { type: "string", required: true, minLength: 8 },
    birthday: { type: "date", required: true },
    bornLocation: { type: "string", required: true },
    department: { type: "string", required: true },
    orderNumber: { type: "number", required: true },
    personalAdress: { type: "string", required: true },
    officeAdress: { type: "string", required: true },
    phoneNumber: { type: "string", required: true },
    gender: { type: "enum", values: ["male", "female"], required: true },
  }

  public login = async (req: Request, res: Response) => {
    const validationResult = this.validators(req.body, this.authValidationPattern);
    if (!validationResult.isValid) {
      res.status(400).send(validationResult.errors);
      return;
    }

    const { email, password } = validationResult.data;
    const userRepository = getRepo(User);

    try {
      // Check if user exists
      const user = await userRepository.findOne({ where: { email } });
      if (!user) {
        res.status(400).send({ error: "Vos identifiants sont incorrects." });
        return;
      }

      // Check if password is correct
      const isPasswordValid = await UtilsAuthentication.check(
        password,
        user.password
      );

      if (!isPasswordValid) {
        res.status(400).send({ error: "Vos identifiants sont incorrects." });
        return;
      }

      // Generate JWT
      const token = UtilsAuthentication.generateToken({ email, id: user.id });

      // Exclure le mot de passe de la réponse
      const { password: _, ...userWithoutPassword } = user;

      res.status(200).send({
        user: userWithoutPassword,
        token,
      });
    } catch (error) {
      this.handleError(res, error, "Authentication", "Une erreur s'est produite, veuillez réessayer ultérieurement", {
        detailsKey: "detailedError",
        detailsValue: (e) => ({
          message: (e as Error).message,
          stack: (e as Error).stack,
          name: (e as Error).name,
          code: (e as any).code || "UNKNOWN_ERROR",
        }),
      });
    }
  }

  public register = async (req: Request, res: Response): Promise<void> => {
    const validationResult = this.validators(req.body, this.registerValidationPattern);
    if (!validationResult.isValid) {
      res.status(400).send(validationResult.errors);
      return;
    }

    const { email, password, fullname, birthday, bornLocation, department, orderNumber, personalAdress, officeAdress, phoneNumber, gender } = validationResult.data;
    const userRepository = getRepo(User);

    try {
      // Check if user already exists
      const existingUser = await userRepository.findOne({ where: { email } });
      if (existingUser) {
        res.status(400).send({
          error:
            "L'adresse email que vous avez renseignée existe déjà, veuillez vous connecter.",
        });
        return;
      }

      const user = userRepository.create({
        email,
        password: await UtilsAuthentication.hash(password),
        fullname,
        birthday,
        bornLocation,
        department,
        orderNumber,
        personalAdress,
        officeAdress,
        phoneNumber,
        gender,
      });

      // Save the user to the database
      await userRepository.save(user);

      // Exclure le mot de passe de la réponse
      const { password: _, ...userWithoutPassword } = user;

      res.status(201).send({
        user: userWithoutPassword,
        token: UtilsAuthentication.generateToken({ email, id: user.id }),
      });
      return;
    } catch (error) {
      this.handleError(res, error, "Authentication", "Une erreur s'est produite, veuillez réessayer ultérieurement", {
        detailsKey: "detailedError",
        detailsValue: (e) => ({
          message: (e as Error).message,
          stack: (e as Error).stack,
          name: (e as Error).name,
          code: (e as any).code || "UNKNOWN_ERROR",
        }),
      });
      return;
    }
  }

  public me = async (req: Request, res: Response) => {
    try {
      // Le middleware JWT a déjà vérifié le token et mis l'utilisateur dans res.locals.user
      if (!res.locals.user || !res.locals.user.id) {
        res.status(401).send({ error: "Token invalide, veuillez vous reconnecter." });
        return;
      }

      const userRepository = getRepo(User);
      const user = await userRepository.findOne({
        where: { id: res.locals.user.id },
      });

      if (!user) {
        res.status(404).send({ error: "Utilisateur non trouvé." });
        return;
      }

      // Exclure le mot de passe de la réponse
      const { password, ...userWithoutPassword } = user;

      res.status(200).send(userWithoutPassword);
    } catch (error) {
      this.handleError(res, error, "Authentication", "Une erreur s'est produite, veuillez réessayer ultérieurement", {
        detailsKey: "detailedError",
        detailsValue: (e) => ({ message: (e as Error).message }),
      });
    }
  }
}

export const authController = new AuthController();
