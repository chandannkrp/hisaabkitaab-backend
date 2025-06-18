import { Router } from "express";
import authenticate from "../middlewares/middleware.auth.js";
import {
  createNewTransaction,
  getTransactions,
  uploadFilesToS3,
} from "../controllers/controller.transaction.js";
import { upload } from "../middlewares/middleware.multer.js";
import { generateTransactionId } from "../utils/generateTransactionId.js";

const router = Router();

router.get("/", authenticate, getTransactions);


router.post(
  "/upload",
  authenticate,
  upload.array("files", 5),
  uploadFilesToS3
);

router.post(
  "/new-transaction",
  authenticate,
  generateTransactionId,
  upload.array("files"),
  uploadFilesToS3,
  createNewTransaction
)







export default router;
