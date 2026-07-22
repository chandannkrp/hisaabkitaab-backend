import { BusinessRelationship, User } from "../models/model.user.js";
import {
  Transaction,
  TransactionTimeline,
} from "../models/model.transaction.js";
import { sendEmail } from "../services/service.emailService.js";
import { deleteFromBucket, uploadToBucket } from "../services/service.s3.js";
import { Document } from "../models/model.document.js";
import jwt from "jsonwebtoken";
import { ingestTransaction } from "./controller.ai.js";
import { asyncHandler } from "../middlewares/middleware.asyncHandler.js";

export const uploadFilesToS3 = asyncHandler(async (req, res, next) => {
  const files = req.files;
  const { customNames } = req.body;
  const transactionId = req.transactionId || req.body.transactionId;

  if (!files) {
    return res.status(400).json({ message: "No files uploaded" });
  }

  // req.user is only set when this runs after an auth middleware (e.g. authenticateToken);
  // the public document-upload route calls this before it verifies the token itself.
  let userId = req.user?._id;
  if (!userId) {
    const accessToken = req.cookies["token"] || req.cookies["view-refresh-token"] || null;
    if (accessToken) {
      const verifiedToken = jwt.verify(accessToken, process.env.JWT_SECRET);
      userId = verifiedToken.userId;
    }
  }

  const mimeTypes = files.map((file) => file.mimetype);

  //upload files to bucket
  const uploadedFiles = await Promise.all(
    files.map(async (file, index) => {
      const result = await uploadToBucket(
        file.buffer,
        transactionId + "-" + customNames[index],
        file.mimetype,
        userId || "unknown",
        "transaction"
      );
      return { url: result.Location, key: result.Key };
    })
  );

  req.files = uploadedFiles;
  req.mimeTypes = mimeTypes;
  next();
});

export const addNewTransaction = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const {
    transactionTitle,
    description,
    ownerEmail,
    collaborators,
    customNames,
  } = req.body;
  const uploadedFiles = req.files;
  const mimeTypes = req.mimeTypes;
  const parsedCollaborators = JSON.parse(collaborators);

  //validate required fields
  if (!transactionTitle || !ownerEmail || !collaborators) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const collaboratorsEmail = parsedCollaborators.map(
    (collaborator) => collaborator.email
  );

  const collaboratorsProfiles = await User.find({
    email: { $in: collaboratorsEmail },
  });

  const user = await User.findById(userId);

  if (!user) {
    return res.status(400).json({ message: "User not found" });
  }

  //create the document records, waiting for every save to finish before continuing
  const documentsData = await Promise.all(
    uploadedFiles.map((file, index) =>
      new Document({
        transactionId: req.transactionId,
        fileName: customNames[index],
        fileUrl: file.url,
        fileType: mimeTypes[index],
        bucket: process.env.AWS_BUCKET_NAME,
        s3Key: file.key,
        uploadedBy: user.name,
      }).save()
    )
  );

  const transaction = new Transaction({
    transactionId: req.transactionId,
    ownerEmailId: ownerEmail,
    createdBy: user.email,
    title: transactionTitle,
    description: description,
    status: "inprogress",
    collaborators: collaboratorsProfiles,
    documents: documentsData.map((doc) => doc._id),
  });

  transaction.verifiedBy.push(userId);

  await transaction.save();

  //send emails to the collaborators
  // Notifications are best-effort: the transaction is already persisted by this point,
  // so a mail delivery failure (e.g. an unverified/expired SES sender domain) must not
  // turn a successful creation into a 500. We track delivery and surface it downstream.
  const willBroadcastEmails = process.env.NODE_ENV !== "development";
  let notificationsDelivered = true;
  if (willBroadcastEmails) {
    for (const collaborator of collaboratorsProfiles) {
      try {
        await sendEmail(
          collaborator.email,
          "New transaction initiated by " +
            `${user.companyName ? user.companyName : user.name}`,
          "transactionNotification.html",
          {
            userName: collaborator.name,
            transactionTitle: transactionTitle,
            transactionId: req.transactionId,
            createdBy:
              user.name + `${user.companyName ? ` (${user.companyName})` : ""}`,
            tlink: `${
              process.env.NODE_ENV === "development"
                ? process.env.CLIENT_URL_2
                : process.env.DEP_URL
            }/transaction/pre-authorize?tid=${req.transactionId}&userId=${
              collaborator._id
            }`,
          }
        );
      } catch (error) {
        notificationsDelivered = false;
        console.log(
          `Failed to send transaction notification to ${collaborator.email}: ${error.message}`
        );
      }
    }
  }

  req.notificationsDelivered = notificationsDelivered;

  ingestTransaction({ transactionId: req.transactionId, ingestionReason: "FULL_REBUILD" });

  next();
});

export const getTransactions = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const user = await User.findById(userId);
  if (!user) {
    return res.status(400).json({ message: "User not found" });
  }

  const transactions = await Transaction.find({
    $or: [
      { createdBy: user.email },
      { collaborators: { $in: [user._id] } },
      { ownerEmailId: user.email },
    ],
  });

  res.status(200).json({ transactions });
});

export const getTransactionById = asyncHandler(async (req, res) => {
  const transactionId = req.params.id || req.params.tid;

  const accessToken =
    req.cookies["token"] || req.cookies["view-refresh-token"] || null;

  if (!accessToken) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const verifiedToken = jwt.verify(accessToken, process.env.JWT_SECRET);
  const requestingUser = await User.findById(verifiedToken.userId);

  const transaction = await Transaction.findOne({
    transactionId: transactionId,
  });

  if (!transaction) {
    return res.status(404).json({ message: "Transaction not found" });
  }

  const ownerUser = await User.findOne({ email: transaction.ownerEmailId });

  //find the collborators from the User model using the ids in the transaction
  let collaborators = await User.find({
    _id: { $in: transaction.collaborators },
  });
  collaborators.push(ownerUser);

  //requesting user has verified the transaction or not
  const userHasVerified = transaction.verifiedBy
    .map((id) => id.toString())
    .includes(requestingUser._id.toString());

  //updating the collaborators object to include the owner user
  collaborators = collaborators.map((collaborator) => {
    return {
      ...collaborator._doc,
      isOwner: collaborator._id.toString() === ownerUser._id.toString(),
    };
  });

  // attach some info about the user requesting
  const requestingUserInfo = {
    name: requestingUser.name,
    email: requestingUser.email,
    company: requestingUser.companyName,
  };

  res.status(200).json({
    transaction,
    collaborators,
    requestingUserInfo,
    userHasVerified,
  });
});

export const getTransactionDocumentsById = asyncHandler(async (req, res) => {
  const transactionId = req.params.id;

  const accessToken =
    req.cookies["token"] || req.cookies["view-refresh-token"] || null;

  if (!accessToken) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  jwt.verify(accessToken, process.env.JWT_SECRET);

  const transaction = await Transaction.findOne({
    transactionId: transactionId,
  });

  if (!transaction) {
    return res.status(404).json({ message: "Transaction not found" });
  }

  const documents = await Document.find({
    transactionId: transactionId,
  });

  res.status(200).json({ documents });
});

export const verifyTransactionById = asyncHandler(async (req, res, next) => {
  const transactionId = req.params.id || req.params.tid;

  const accessToken =
    req.cookies["token"] || req.cookies["view-refresh-token"] || null;

  if (!accessToken) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const verfiedToken = jwt.verify(accessToken, process.env.JWT_SECRET);
  const user = await User.findById(verfiedToken.userId);
  const userId = req.user?._id || user._id;

  const transaction = await Transaction.findOne({
    transactionId: transactionId,
  });

  if (!transaction) {
    return res.status(404).json({ message: "Transaction not found" });
  }

  // check if the user has already verified
  if (transaction.verifiedBy.includes(userId)) {
    return res
      .status(400)
      .json({ message: "You have already verified this transaction" });
  }

  //update the status of the transaction to verified
  transaction.verifiedBy.push(userId);

  if (
    transaction.verifiedBy.length - 1 ===
    transaction.collaborators.length
  ) {
    transaction.status = "completed";

    //send transaction completion emails (best-effort: don't fail verification on a mail error)
    try {
      await sendEmail(
        transaction.ownerEmailId,
        "Transaction Completed: " + transaction.title,
        "transactionCompletionEmail.html",
        {
          userName: user.name,
          transactionTitle: transaction.title,
          transactionId: transaction.transactionId,
        }
      );
    } catch (error) {
      console.log(
        `Failed to send transaction completion email to ${transaction.ownerEmailId}: ${error.message}`
      );
    }
  }

  await transaction.save();

  req.transactionId = transactionId;

  await ingestTransaction({
    transactionId: transactionId,
    ingestionReason: "VERIFICATION_UPDATE",
  });

  next();
});

export const patchTransactionDetailsById = asyncHandler(async (req, res, next) => {
  const transactionId = req.params.transactionId;
  const userId = req.user._id;
  const { title, description } = req.body;

  const user = await User.findById(userId);

  const transaction = await Transaction.findOne({
    transactionId: transactionId,
  });

  if (!transaction) {
    return res.status(404).json({ message: "Transaction not found" });
  }

  if (
    transaction.ownerEmailId !== user.email ||
    transaction.createdBy !== user.email
  ) {
    return res
      .status(403)
      .json({ message: "You are not authorized to update this transaction" });
  }

  //update the transaction details
  transaction.title = title || transaction.title;
  transaction.description = description || transaction.description;
  transaction.updatedAt = new Date();

  await transaction.save();

  req.transactionId = transactionId;
  req.ingestionReason = "DETAILS_UPDATE";
  next();
});

export const deleteTransactionById = asyncHandler(async (req, res) => {
  const transactionId = req.params.id || req.params.tid;
  const userId = req.user?._id || req.params.userid;

  const transaction = await Transaction.findOne({
    transactionId: transactionId,
  });
  const user = await User.findById(userId);

  if (!transaction) {
    return res.status(404).json({ message: "Transaction not found" });
  }

  if (
    transaction.createdBy !== userId &&
    transaction.ownerEmailId !== user.email
  ) {
    return res
      .status(403)
      .json({ message: "You are not authorized to delete this transaction" });
  }

  //delete the transaction
  await Transaction.deleteOne({
    transactionId: transactionId,
  });

  const documents = await Document.find({ transactionId: transactionId });

  // Best-effort S3 cleanup — don't fail the whole delete if a file can't be removed from the bucket
  await Promise.all(
    documents.map(async (document) => {
      try {
        await deleteFromBucket(document.s3Key);
      } catch (error) {
        console.log(
          `Error deleting document ${document._id} from S3:`,
          error
        );
      }
    })
  );

  await Document.deleteMany({ transactionId: transactionId });

  //delete the timeline entries
  await TransactionTimeline.deleteMany({ transactionId: transactionId });

  res.status(200).json({ message: "Transaction deleted successfully" });
});

export const addNewDocumentToTransaction = asyncHandler(async (req, res, next) => {
  const transactionId = req.params.id || req.params.tid;
  const accessToken =
    req.cookies["token"] || req.cookies["view-refresh-token"] || null;

  if (!accessToken) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const verfiedToken = jwt.verify(accessToken, process.env.JWT_SECRET);
  const user = await User.findById(verfiedToken.userId);

  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { customNames } = req.body;
  const uploadedFiles = req.files;
  const mimeTypes = req.mimeTypes;

  if (!uploadedFiles || uploadedFiles.length === 0) {
    return res.status(400).json({ message: "No files uploaded" });
  }

  const transaction = await Transaction.findOne({
    transactionId: transactionId,
  });

  if (!transaction) {
    return res.status(404).json({ message: "Transaction not found" });
  }

  // if(!transaction.collaborators.includes(user._id)){
  //   return res.status(403).json({ message: "You are not authorized to add documents to this transaction" });
  // }

  //create the document records, waiting for every save to finish before continuing
  const documentsData = await Promise.all(
    uploadedFiles.map((file, index) =>
      new Document({
        transactionId: transactionId,
        fileName: customNames[index],
        fileUrl: file.url,
        fileType: mimeTypes[index],
        bucket: process.env.AWS_BUCKET_NAME,
        s3Key: file.key,
        uploadedBy: user.name,
      }).save()
    )
  );

  //update the transaction with the new documents
  transaction.documents.push(...documentsData.map((doc) => doc._id));

  await transaction.save();

  req.transactionId = transactionId;

  ingestTransaction({
    transactionId: req.transactionId,
    ingestionReason: "DOCUMENT_UPLOADED",
  });

  next();
});

//user metrics
export const getUserMetrics = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const user = await User.findById(userId);

  const numberOfTransactionInvolved = await Transaction.countDocuments({
    $or: [
      { createdBy: user.email },
      { collaborators: userId },
      { ownerEmailId: user.email },
    ],
  });

  const numberOfTransactionPending = await Transaction.countDocuments({
    $or: [
      { createdBy: user.email, status: "inprogress" },
      { collaborators: userId, status: "inprogress" },
      { ownerEmailId: user.email, status: "inprogress" },
    ],
  });

  const numberOfDocumentsInVault = await Document.countDocuments({
    $or: [{ uploadedByUid: userId }, { uploadedBy: user.name }],
  });

  const numberOfUserClients = await BusinessRelationship.countDocuments({
    isActive: true,
    $or: [{ primaryBusiness: userId }, { relatedBusiness: userId }],
  });

  res.status(200).json({
    numberOfUserClients,
    numberOfTransactionInvolved,
    numberOfTransactionPending,
    numberOfDocumentsInVault,
  });
});
