import { BusinessRelationship, User } from "../models/model.user.js";
import {
  Transaction,
  TransactionTimeline,
} from "../models/model.transaction.js";
import { sendEmail } from "../services/service.mailling.js";
import { deleteFromBucket, uploadToBucket } from "../services/service.s3.js";
import { Document } from "../models/model.document.js";
import jwt from "jsonwebtoken";

export const createTransaction = async (req, res) => {
  try {
    const { title, description, parties, dueDate, notify } = req.body.jsonData
      ? JSON.parse(req.body.jsonData)
      : req.body;
    const businessId = req.user._id;

    //validate required fields
    if (!title || !parties || !dueDate) {
      return res.status(400).json({ message: "All fields are required" });
    }

    //validate parties
    const users = await User.find({
      _id: { $in: parties.map((p) => p.user) },
    });
    if (users.length !== parties.length) {
      return res.status(400).json({ message: "Invalid party user(s)" });
    }

    // get the attachements
    const attachments = req.files || [];

    //create the transaction
    const transaction = new Transaction({
      transactionId: req.transactionId,
      business: businessId,
      title,
      description,
      parties,
      attachments: attachments.map((file) => ({
        url: file,
        name: file.split("/").pop(),
      })),
      dueDate,
      status: "pending-verification",
    });

    await transaction.save();
    // await generateReceiptPDF(transaction, `../receipts/${transaction._id}.pdf`);

    //notify all the parties
    if (notify == "true") {
      const business = await User.findById(businessId);
      for (const party of parties) {
        const user = await User.findById(party.user);

        //send email
        await sendEmail(
          user.email,
          "New transaction created",
          "transactionNotification.html",
          {
            userName: user.name,
            businessName: business.name,
            transactionTitle: title,
            transactionId: req.transactionId,
            dueDate,
          }
        );
      }
    }

    res.status(201).json({
      message: "Transaction created. Parties have been notified",
      transaction,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const createNewTransaction = async (req, res) => {
  try {
    const { title, description, parties, deadline } = req.body.formData
      ? JSON.parse(req.body.formData)
      : req.body;
    const files = req.files;

    //validate required fields
    if (!title || !parties || !deadline) {
      return res.status(400).json({ message: "All fields are required" });
    }

    //validate parties
    // const users = await User.find({
    //   _id: { $in: parties.map((p) => p.user) },
    // });

    // if (users.length !== parties.length) {
    //   return res.status(400).json({ message: "Invalid party user(s)" });
    // }

    //get the parties
    const partiesInvolved = JSON.parse(parties).map((party) => ({
      user: party,
      acknowledged: false,
    }));

    //get the attachments
    const attachments = files.map((file) => ({
      url: file,
      title: file.split("/").pop(),
    }));

    //create the transaction
    const transaction = new Transaction({
      transactionId: req.transactionId,
      createdBy: req.user._id,
      title,
      description,
      parties: partiesInvolved,
      attachments,
      dueDate: deadline,
      status: "pending",
    });

    await transaction.save();

    res.status(200).json({
      message: "Transaction created successfully",
      transaction: transaction,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: `Server Responded with Error : 500` });
  }
};

export const uploadFilesToS3 = async (req, res, next) => {
  try {
    const files = req.files;
    const { customNames } = req.body;
    const mimeTypes = files.map((file) => file.mimetype);

    if (!files) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    //upload files to bucket
    const fileUrls = await Promise.all(
      files.map(async (file, index) => {
        const result = await uploadToBucket(
          file.buffer,
          req.transactionId + "-" + customNames[index],
          file.mimetype,
          "transaction"
        );
        return result.Location;
      })
    );

    // res.status(200).json({ message: "Files uploaded", fileUrls });
    req.files = fileUrls;
    req.mimeTypes = mimeTypes;
    next();
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error hai" });
  }
};

export const addNewTransaction = async (req, res, next) => {
  const userId = req.user._id;

  try {
    const {
      transactionTitle,
      description,
      ownerEmail,
      collaborators,
      customNames,
    } = req.body;
    const documents = req.files;
    const mimeTypes = req.mimeTypes;
    const parsedCollaborators = JSON.parse(collaborators);

    //  console.log('Transaction Data:', {
    //   ownerEmail,
    //   transactionTitle,
    //   description,
    //   collaborators: parsedCollaborators,
    //   documents,
    //   files: req.files,
    // });

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

    //update files in the db
    documents.forEach(async (file, index) => {
      const newFile = {
        transactionId: req.transactionId,
        fileName: customNames[index],
        fileUrl: file,
        fileType: mimeTypes[index],
        uploadedBy: user.name,
      };
      const document = new Document(newFile);
      await document
        .save()
        .then(() => {
          console.log("File uploaded successfully");
        })
        .catch((error) => {
          console.error("Error uploading file:", error);
        });
    });

    const documentsData = await Document.find({
      transactionId: req.transactionId,
    });

    const newTransaction = {
      transactionId: req.transactionId,
      ownerEmailId: ownerEmail,
      createdBy: user.email,
      title: transactionTitle,
      description: description,
      status: "inprogress",
      collaborators: collaboratorsProfiles,
      documents: documentsData.map((doc) => doc._id),
    };

    const transaction = new Transaction(newTransaction);

    transaction.verifiedBy.push(userId);

    await transaction.save();

    //send emails to the collaborators
    for (const collaborator of collaboratorsProfiles) {
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
    }

    // res.status(200).json({message: "Transaction created successfully"});

    next();
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getTransactions = async (req, res) => {
  const userId = req.user._id;
  try {
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
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getTransactionById = async (req, res) => {
  const transactionId = req.params.id || req.params.tid;

  // get the token
  const accessToken =
    req.cookies["token"] || req.cookies["view-refresh-token"] || null;

  if (!accessToken) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const verifiedToken = jwt.verify(accessToken, process.env.JWT_SECRET);
  const userId = await User.findById(verifiedToken.userId);

  try {
    const transaction = await Transaction.findOne({
      transactionId: transactionId,
    });

    const ownerEmailId = transaction.ownerEmailId;
    const ownerUser = await User.findOne({
      email: ownerEmailId,
    });

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    //find the collborators from the User model using the ids in the transaction
    let collaborators = await User.find({
      _id: { $in: transaction.collaborators },
    });
    collaborators.push(ownerUser);

    //requesting user has verified the transaction or not
    const userHasVerified = transaction.verifiedBy.map((id) => id.toString()).includes(userId._id.toString());
    console.log(userHasVerified)

    //updating the collaborators object to include the owner user
    collaborators = collaborators.map((collaborator) => {
      return {
        ...collaborator._doc,
        isOwner: collaborator._id.toString() === ownerUser._id.toString(),
      };
    });

    res.status(200).json({ transaction, collaborators, userHasVerified });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getTransactionDocumentsById = async (req, res) => {
  const transactionId = req.params.id;

  // get the token
  const accessToken =
    req.cookies["token"] || req.cookies["view-refresh-token"] || null;

  if (!accessToken) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const verfiedToken = jwt.verify(accessToken, process.env.JWT_SECRET);
  const userId = await User.findById(verfiedToken.userId);

  try {
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
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const verifyTransactionById = async (req, res, next) => {
  const transactionId = req.params.id || req.params.tid;

  // get the token
  const accessToken =
    req.cookies["token"] || req.cookies["view-refresh-token"] || null;

  if (!accessToken) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const verfiedToken = jwt.verify(accessToken, process.env.JWT_SECRET);
  const user = await User.findById(verfiedToken.userId);


  const userId = req.user?._id || user._id;


  try {
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
      
      //send transaction completion emails 
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
    }

    await transaction.save();

    req.transactionId = transactionId;

    next();
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const patchTransactionDetailsById = async (req, res, next) => {
  const transactionId = req.params.transactionId;
  const userId = req.user._id;

  try {
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
    next();
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteTransactionById = async (req, res) => {
  const transactionId = req.params.id || req.params.tid;
  const userId = req.user?._id || req.params.userid;

  try {
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

    //delete the documents from s3 bucket
    // await Document.deleteMany({
    //   transactionId: transactionId
    // });

    //delete the timeline entries
    await TransactionTimeline.deleteMany({
      transactionId: transactionId,
    });

    res.status(200).json({ message: "Transaction deleted successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const addNewDocumentToTransaction = async (req, res, next) => {
  const transactionId = req.params.id || req.params.tid;
  // get the token
  const accessToken =
    req.cookies["token"] || req.cookies["view-refresh-token"] || null;

  if (!accessToken) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const verfiedToken = jwt.verify(accessToken, process.env.JWT_SECRET);
  const userId = await User.findById(verfiedToken.userId);

  try {
    const { customNames } = req.body;
    const documents = req.files;
    const mimeTypes = req.mimeTypes;

    if (!documents || documents.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const transaction = await Transaction.findOne({
      transactionId: transactionId,
    });

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    // if(!transaction.collaborators.includes(userId)){
    //   return res.status(403).json({ message: "You are not authorized to add documents to this transaction" });
    // }

    const user = await User.findById(userId);

    //update files in the db
    documents.forEach(async (file, index) => {
      const newFile = {
        transactionId: transactionId,
        fileName: customNames[index],
        fileUrl: file,
        fileType: mimeTypes[index],
        uploadedBy: user.name,
      };
      const document = new Document(newFile);
      await document
        .save()
        .then(() => {
          console.log("File uploaded successfully");
        })
        .catch((error) => {
          console.error("Error uploading file:", error);
        });
    });

    const documentsData = await Document.find({
      transactionId: transactionId,
    });
    //update the transaction with the new documents
    transaction.documents.push(...documentsData.map((doc) => doc._id));

    await transaction.save();

    req.transactionId = transactionId;

    next();
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

//user metrics
export const getUserMetrics = async (req, res) => {
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
};
