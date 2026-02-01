import crypto from "crypto";

export const generateTransactionId = async (req, res, next) => {
  try {
    const transactionId = new Date().toISOString().slice(2,10).replace(/-/g, "")+ "-" +crypto.randomUUID().toString("hex").substring(0, 6);
    req.transactionId = transactionId;
    next();
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error" });
  }
};
