import { authController } from "../controllers/AuthController";
import express, { Router } from "express";

const AuthRouter: Router = express.Router();

// Le parsing JSON est géré de façon centralisée dans routes/index.ts.
AuthRouter.patch("/", authController.register);
AuthRouter.post("/", authController.login);
AuthRouter.get("/me", authController.me);

export default AuthRouter;
