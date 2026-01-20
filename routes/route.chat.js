import express from "express";
import Message from "../models/model.message.js";

const router = express.Router();

router.get("/:tid", async (req, res) => {
    const { tid } = req.params;
  
    const messages = await Message.find({ tid })
      .populate("senderId", "name email") // 👈 important
      .sort({ createdAt: 1 });
  
    res.json(messages);
  });
  

export default router;
