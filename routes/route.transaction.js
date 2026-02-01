import { Router } from "express";
import authenticate, { authenticateToken } from "../middlewares/middleware.auth.js";
import {
  getTransactions,
  uploadFilesToS3,
} from "../controllers/controller.transaction.js";
import { upload } from "../middlewares/middleware.multer.js";
import { generateTransactionId } from "../utils/generateTransactionId.js";

const router = Router();

router.get("/", authenticate, getTransactions);


router.post(
  "/upload",
  authenticateToken,
  upload.array("files", 5),
  uploadFilesToS3
);

// router.post(
//   "/new-transaction",
//   authenticateToken,
//   generateTransactionId,
//   upload.array("files"),
//   uploadFilesToS3,
//   createNewTransaction
// )







export default router;
