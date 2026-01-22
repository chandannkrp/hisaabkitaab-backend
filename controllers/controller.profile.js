import { User } from "../models/model.user.js";
import logger from "../utils/logger.js";

export const getProfile = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res
        .status(401)
        .json({ message: "Unauthorized: No user ID provided" });
    }

    // Fetch user from database
    const user = await User.findById(req.user._id).select("-password");

    // Handle case where user is not found
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Send response
    res.status(200).json({ user });
  } catch (error) {
    console.error("Error fetching profile:", error);

    // Handle Mongoose-specific errors
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteProfile = async (req, res) => {
  try {
    const userId = req.user;

    //deactivate user
    const user = await User.findByIdAndUpdate(userId, { isActive: false });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    //log activity
    logger.info(`User deleted their profile: ${user.email}, IP: ${req.ip}`);

    res.status(200).json({ message: "Profile deleted successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const { username, company, address } = req.body;


    const user = await User.findById(userId);

    //find the user
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    //update user
    user.name =  username? username : user.username;
    user.address =  address? address : user.address;
    user.companyName =  company? company : user.companyName;

    await user.save();

    logger.info(`User updated their profile: ${user.email}, IP: ${req.ip}`);

    res.status(200).json({
      message: "Profile updated successfully",
    });
  } catch (error) {
    console.error("Update Profile Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
