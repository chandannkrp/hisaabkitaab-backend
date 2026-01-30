import axios from "axios";

export const ingestTransaction = async ({ transactionId, ingestionReason }) => {
  const { HK_AI_SERVICE_URL, HK_INTERNAL_API_KEY } = process.env;

  console.log("INGESTION INPUT →", {
    transactionId,
    ingestionReason,
  });

  try {
    const response = await axios.get(
      `${HK_AI_SERVICE_URL}/ingest/transaction/${transactionId}?reason=${ingestionReason}`,
      {
        headers: {
          "x-internal-key": HK_INTERNAL_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );
    console.log("Ingestion response");
  } catch (error) {
    console.error("Error ingesting transaction to AI service:");
  }
};

export const chatClient = async (req, res) => {
  const { HK_AI_SERVICE_URL, HK_INTERNAL_API_KEY } = process.env;
  const { transactionId, question } = req.body;

  try {
    const response = await axios.post(
      `${HK_AI_SERVICE_URL}/ask`,
      {
        transaction_id: transactionId,
        question: question,
      },
      {
        headers: {
          "x-internal-key": HK_INTERNAL_API_KEY,
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
