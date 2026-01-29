import express from "express";
import { getChatMessagesByTransactionId } from "../controllers/controller.chats.js";
import { authenticateToken } from "../middlewares/middleware.auth.js";
import { chatClient } from "../controllers/controller.ai.js";

const router = express.Router();

router.get("/:tid", authenticateToken, getChatMessagesByTransactionId);
router.post("/ai/ask", chatClient)  

export default router;
