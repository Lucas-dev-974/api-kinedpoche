import { contractController } from "../controllers/ContractController";
import express, { Router } from "express";

const ContractRouter: Router = express.Router();

// Le parsing JSON est géré de façon centralisée dans routes/index.ts.
ContractRouter.get("/", contractController.list);
ContractRouter.post("/", contractController.create);
ContractRouter.patch("/", contractController.update);
ContractRouter.get("/search", contractController.search);
ContractRouter.post("/list-ids", contractController.listFromIDS);
ContractRouter.get("/get-by-token", contractController.getByToken);
ContractRouter.delete("/:id", contractController.delete);

export default ContractRouter;
