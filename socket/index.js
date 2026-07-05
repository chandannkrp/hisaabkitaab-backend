import { Server } from "socket.io";
import Message from "../models/model.message.js";
import { ingestTransaction } from "../controllers/controller.ai.js";
import { publishIngestionEvent } from "../services/service.publish-sqs.js";

export const initSocket = (server) => {
  const io = new Server(server, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    cors: {
      origin: [
        process.env.CLIENT_URL,
        process.env.CLIENT_URL_2,
        process.env.DEP_URL,
        process.env.DEP_URL_WWW,
      ],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("🔌 Socket connected:", socket.id);

    socket.on("join_room", ({ tid }) => {
      socket.join(tid);
      console.log(`Socket ${socket.id} joined room ${tid}`);
    });

    socket.on("send_message", async ({ tid, senderId, text }) => {
      try {
        const message = await Message.create({
          tid,
          senderId,
          text,
        });

        const populatedMessage = await Message.findById(message._id).populate(
          "senderId",
          "name"
        );

        publishIngestionEvent({
          transactionId: tid,
          ingestionReason: "MESSAGE_ADDED",
        });

        io.to(tid).emit("receive_message", populatedMessage);
      } catch (error) {
        console.error("Error handling send_message:", error);
      }
    });

    socket.on("disconnect", () => {
      console.log("❌ Socket disconnected:", socket.id);
    });
  });

  return io;
};
