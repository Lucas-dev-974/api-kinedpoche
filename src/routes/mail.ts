import { mailController } from "../controllers/MailController";
import express, { Router } from "express";
import { upload } from "../multerUpload";
import { bugReportLimiter, sendContractLimiter } from "../middleware/rateLimit";

const MAX_BUG_SCREENSHOTS = 15;

const MailRouter: Router = express.Router();

// Limite explicite des corps urlencoded (les fichiers passent par multer).
MailRouter.use(express.urlencoded({ extended: false, limit: "1mb" }));
MailRouter.post("/send-contract", sendContractLimiter, upload.single("contractFile"), mailController.sendContract);
MailRouter.post("/report-bug", bugReportLimiter, upload.array("screenshots", MAX_BUG_SCREENSHOTS), mailController.reportBug);

export default MailRouter;
