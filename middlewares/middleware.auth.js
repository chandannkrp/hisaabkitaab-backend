import jwt from "jsonwebtoken";
import { User } from "../models/model.user.js";
import "../config/config.env.js";

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = req.cookies.token || (authHeader && authHeader.split(" ")[1]); // Bearer token

    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const verified = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(verified.userId);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (req.path === "/validate-token") {
      return res.status(200).json({ message: "Token is valid" });
    }

    req.user = user;

    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next(error);
  }
};

export const authenticateToken = async (req, res, next) => {
  try {
    // get the token
    const accessToken =
      req.cookies["token"] || req.cookies["view-refresh-token"] || null;

    if (!accessToken) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const verifiedToken = jwt.verify(accessToken, process.env.JWT_SECRET);
    const user = await User.findById(verifiedToken.userId);

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    req.user = user;

    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next(error);
  }
};

export default authenticate;
