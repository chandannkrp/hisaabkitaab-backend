
import { BusinessRelationship, User } from "../models/model.user.js";


export const getUserClients = async (req, res) => {
  const userId = req.user._id;

  try {

    // Find the user and populate the clients field
    const user = await User.findById(userId)

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if the user has clients or user is a client of other users
    const relationships = await BusinessRelationship.find({
            isActive: true,
            $or: [
                { primaryBusiness: userId },
                { relatedBusiness: userId }
            ]
        })
        .populate("primaryBusiness")
        .populate("relatedBusiness");

        const clientsSet = new Set();

        relationships.forEach(rel => {
          if (rel.primaryBusiness._id.toString() === userId.toString()) {
              // relatedBusiness is a single user, not an array
              if (rel.relatedBusiness && rel.relatedBusiness._id) {
                  clientsSet.add(rel.relatedBusiness._id.toString());
              }
          } else {
              if (rel.primaryBusiness && rel.primaryBusiness._id) {
                  clientsSet.add(rel.primaryBusiness._id.toString());
              }
          }
      });
      

        // Now get full client details based on IDs in clientsSet
        const clientIds = Array.from(clientsSet);
        const clients = await User.find({ _id: { $in: clientIds } }).select("name email companyName");

        res.status(200).json({ clients });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export const addNewUserClient = async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, email, companyName } = req.body;

    // Prevent user from adding themselves
    if (req.user.email === email) {
      return res.status(400).json({ message: "You cannot add yourself as a client" });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      const existingUserId = existingUser._id;

      // Check if an active relationship already exists
      const existingActiveRelation = await BusinessRelationship.findOne({
        primaryBusiness: userId,
        relatedBusiness: existingUserId,
        isActive: true,
      });

      if (existingActiveRelation) {
        return res.status(400).json({ message: "Relation already exists with this client" });
      }

      // Check if an inactive relationship exists
      const existingInactiveRelation = await BusinessRelationship.findOne({
        primaryBusiness: userId,
        relatedBusiness: existingUserId,
        isActive: false,
      });

      if (existingInactiveRelation) {
        existingInactiveRelation.isActive = true;
        await existingInactiveRelation.save();
        return res.status(200).json({ message: "Client reactivated successfully", userId, client: existingUser });
      }

      // Otherwise, create a new relationship
      const relation = new BusinessRelationship({
        primaryBusiness: userId,
        relatedBusiness: existingUserId,
      });
      await relation.save();

      return res.status(200).json({ message: "Client added successfully", userId, client: existingUser });
    }

    // Create a new client user
    const newClient = new User({ name, email, companyName });
    await newClient.save();

    // Create a new relationship
    const relation = new BusinessRelationship({
      primaryBusiness: userId,
      relatedBusiness: newClient._id,
    });
    await relation.save();

    return res.status(200).json({ message: "Client added successfully", userId, client: newClient });

  } catch (error) {
    console.error("Error adding client:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};


export const removeUserClientById = async (req, res) => {
  const userId = req.user._id;
  const clientEmail = req.body.email;

  try {
    const clientId = await User.findOne({ email: clientEmail }).select("_id");

    // Check if the relationship exists
    const relationship = await BusinessRelationship.findOne({
      primaryBusiness: userId || clientId,
      relatedBusiness: clientId || userId,
      isActive: true,
    });

    if (!relationship) {
      return res.status(404).json({ message: "Relationship not found" });
    }

    // Deactivate the relationship
    relationship.isActive = false;
    await relationship.save();

    res.status(200).json({ message: "Client removed successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
}
