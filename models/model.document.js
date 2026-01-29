import { Schema, model } from "mongoose";

const transactionDocumentSchema = new Schema({
  transactionId: {
    type: String,
    required: true,
  },
  fileName: {
    type: String,
    required: true,
  },
  fileUrl: {
    type: String,
  },
  s3Key:{
    type: String,
  },
  bucket:{
    type: String,
  },
  fileType: {
    type: String,
    required: true,
  },
  uploadedBy: {
    type: String,
    required: true,
  },
  uploadedByUid : {
    type: String,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const Document = model(
  "Document",
  transactionDocumentSchema
);
