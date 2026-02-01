import axios from "axios";
import { publishIngestionEvent } from "../services/service.publish-sqs.js";

export const ingestTransaction = async ({ transactionId, ingestionReason }) => {
  try {
    console.log(
      "Ingesting transaction to AI service:",
      transactionId,
      ingestionReason
    );
    publishIngestionEvent({
      transactionId: transactionId,
      ingestionReason: ingestionReason,
    });
  } catch (error) {
    console.error("Error ingesting transaction to AI service:" ,error);
  }
};

export const chatClient = async (req, res) => {
  const { transactionId, question } = req.body;

  try {
    const response = await axios.post(
      `${process.env.HK_AI_SERVICE_URL}/ask`,
      {
        transaction_id: transactionId,
        question: question,
      },
      {
        headers: {
          "x-internal-key": process.env.HK_INTERNAL_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    return res.status(200).json({ reply: response.data });
  } catch (error) {
    console.error("Error communicating with AI service:", error);
    return res
      .status(500)
      .json({ error: "Failed to get response from AI service" });
  }
};
