import express from "express";
import { getChatMessagesByTransactionId } from "../controllers/controller.chats.js";
import { authenticateToken } from "../middlewares/middleware.auth.js";

const router = express.Router();

router.get("/:tid", authenticateToken, getChatMessagesByTransactionId);
  

export default router;
