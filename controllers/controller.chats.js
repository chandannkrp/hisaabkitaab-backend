import Message from "../models/model.message.js";
import { asyncHandler } from "../middlewares/middleware.asyncHandler.js";

export const getChatMessagesByTransactionId = asyncHandler(async (req, res) => {
  const { tid } = req.params;

  const messages = await Message.find({ tid })
    .populate("senderId", "name email")
    .sort({ createdAt: 1 });

  res.json(messages);
});
