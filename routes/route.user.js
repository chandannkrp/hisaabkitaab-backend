import { Router } from "express";
import {
  loginUser,
  registerUser,
  verifyOTP,
  forgotPassword,
  resetPassword,
  resendOtp,
  logoutUser,
  authorizeEmail,
  authorizeEmailOTP,
} from "../controllers/controller.user.js";
import authenticate, { authenticateToken } from "../middlewares/middleware.auth.js";
import {
  apiLimiter,
  forgotPasswordLimiter,
} from "../middlewares/middleware.rateLimit.js";
import { upload } from "../middlewares/middleware.multer.js";
import {
  updateProfile,
  getProfile,
} from "../controllers/controller.profile.js";
import {
  createCategory,
  deleteCategoryById,
  getCategories,
} from "../controllers/controller.category.js";
import {
  addNewUserClient,
  getUserClients,
  removeUserClientById,
} from "../controllers/controller.relation.js";
import {
    addNewDocumentToTransaction,
  addNewTransaction,
  deleteTransactionById,
  getTransactionById,
  getTransactionDocumentsById,
  getTransactions,
  getUserMetrics,
  patchTransactionDetailsById,
  uploadFilesToS3,
  verifyTransactionById,
} from "../controllers/controller.transaction.js";
import { generateTransactionId } from "../utils/generateTransactionId.js";
import {
  getTimelineById,
  initTimeline,
  updateTransactionDetailsTimeline,
  updateVerificationTimeline,
} from "../controllers/controller.timeline.js";
const router = Router();
router.use(apiLimiter);

//user routes
router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/logout", logoutUser);
router.post("/resend-otp", resendOtp);
router.post("/verify-otp", verifyOTP);
router.post("/forgot-password", forgotPasswordLimiter, forgotPassword);
router.post("/reset-password/:token", resetPassword);
router.post("/validate-token", authenticate);

//profile routes
router.get("/profile", authenticate, getProfile);
router.put("/profile", authenticate, updateProfile);

//clients and relation
router.get("/clients", authenticate, getUserClients);
router.post("/clients", authenticate, addNewUserClient);
router.delete("/clients", authenticate, removeUserClientById);

//category routes
router.get("/categories", authenticate, getCategories);
router.post("/categories", authenticate, createCategory);
router.delete("/categories/:id", authenticate, deleteCategoryById);

//transaction routes
router.get("/transaction", authenticate, getTransactions);
router.get("/transaction/:id", authenticate, getTransactionById);
router.post(
  "/transaction/:id/verify",
  authenticate,
  verifyTransactionById,
  updateVerificationTimeline
);
router.post(
  "/transaction",
  authenticateToken,
  generateTransactionId,
  upload.array("documents[]", 5),
  uploadFilesToS3,
  addNewTransaction,
  initTimeline,
);
router.patch(
  "/transaction/:transactionId/details",
  authenticate,
  patchTransactionDetailsById,
  updateTransactionDetailsTimeline,
);
router.delete("/transaction/:id", authenticate, deleteTransactionById);

//transaction public api routes
router.get("/transaction/:id/documents", getTransactionDocumentsById);
router.get("/transaction-view/:tid", getTransactionById);
router.post(
  "/transaction/:tid/pub/verify",
  verifyTransactionById,
  updateVerificationTimeline
);
router.post(
  "/transaction/:tid/documents",
  upload.array("documents[]", 5),
  uploadFilesToS3,
  addNewDocumentToTransaction,
  updateTransactionDetailsTimeline,
);
router.post("/transaction/authorize-email", authorizeEmail);
router.post("/transaction/authorize-email/verify-otp", authorizeEmailOTP);

//timeline routes
router.get("/timeline/:id", authenticate, getTimelineById);


//user metrics
router.get("/transaction/metrics/userdata", authenticate, getUserMetrics);

export default router;
