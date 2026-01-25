import Message from "../models/model.message.js";
import { Transaction } from "../models/model.transaction.js";


export const getChatMessagesByTransactionId = async (req, res) => {
        const { tid } = req.params;

        
      
        const messages = await Message.find({ tid })
          .populate("senderId", "name email") 
          .sort({ createdAt: 1 });
      
        res.json(messages);
}