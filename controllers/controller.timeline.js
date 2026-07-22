import { TransactionTimeline } from "../models/model.transaction.js";
import { User } from "../models/model.user.js";
import jwt from "jsonwebtoken";
import { ingestTransaction } from "./controller.ai.js";
import { asyncHandler } from "../middlewares/middleware.asyncHandler.js";

export const initTimeline = asyncHandler(async (req, res) => {
  const transactionId = req.transactionId;
  const performedByUserId = req.user._id;

  const createdActivity = new TransactionTimeline({
    transactionId,
    performedByUserId,
    action: "created",
  });

  await createdActivity.save();

  await ingestTransaction({
    transactionId: transactionId,
    ingestionReason: "FULL_REBUILD",
  });

  // notificationsDelivered is set by addNewTransaction; when false the transaction was
  // created successfully but collaborator emails couldn't be delivered (e.g. SES sender
  // domain not verified). Report that honestly instead of failing the request.
  const notificationsDelivered = req.notificationsDelivered !== false;

  res.status(200).json({
    message: notificationsDelivered
      ? "Transaction created successfully!"
      : "Transaction created, but notification emails could not be sent.",
    notificationsDelivered,
  });
});

export const getTimelineById = asyncHandler(async (req, res) => {
  const transactionId = req.params.id;
  const timeline = await TransactionTimeline.find({ transactionId });

  if (!timeline.length) {
    return res.status(404).json({ message: "Timeline not found" });
  }

  const user = await User.findById(timeline[0].performedByUserId);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const resp = timeline.map((item) => {
    return {
      transactionId: item.transactionId,
      action: item.action,
      performedByUserId: user.name,
      timestamp: item.timestamp,
    };
  });

  res.status(200).json({ timeline: resp });
});

export const updateVerificationTimeline = asyncHandler(async (req, res) => {
  const transactionId = req.transactionId;
  const performedByUserId = req.user?._id || req.params?.userId;

  // Recording the timeline entry is best-effort: the transaction is already verified
  // by this point, so a logging failure shouldn't turn into a 500 for the caller.
  try {
    const verifiedActivity = new TransactionTimeline({
      transactionId,
      performedByUserId,
      action: "verified",
    });

    await verifiedActivity.save();
  } catch (err) {
    return res.status(200).json({
      message: "Transaction Verified!, Activity couldn't be recorded",
    });
  }

  res.status(200).json({ message: "Transaction Verified successfully!" });
});

export const updateTransactionDetailsTimeline = asyncHandler(async (req, res) => {
  const transactionId = req.transactionId;

  // get the token
  const accessToken =
    req.cookies["token"] || req.cookies["view-refresh-token"] || null;

  if (!accessToken) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const verfiedToken = jwt.verify(accessToken, process.env.JWT_SECRET);
  const performedByUserId = req.user?._id || verfiedToken.userId;

  const updatedActivity = new TransactionTimeline({
    transactionId,
    performedByUserId,
    action: "updated",
  });

  await updatedActivity.save();

  await ingestTransaction({
    transactionId: transactionId,
    ingestionReason: "DOCUMENT_UPLOADED",
  });

  res.status(200).json({ message: "Transaction updated successfully!" });
});
