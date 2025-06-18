import { TransactionTimeline } from "../models/model.transaction.js";
import { User } from "../models/model.user.js";


export const initTimeline = async (req, res) => {
    try {
      const transactionId = req.transactionId;
      const performedByUserId = req.user._id;
  
      const createdActivity = new TransactionTimeline({
        transactionId,
        performedByUserId,
        action: "created",
      });


      await createdActivity.save();

      if (!createdActivity ) {
        return res.status(404).json({ message: "Activity couldn't be recorded" });
      }
    
      res.status(200).json({ message: "Transaction created succesfull!" });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Internal server error" });
    }
}

export const getTimelineById = async (req, res) => {
    const transactionId = req.params.id;
    try {
        console.log(transactionId);
        const timeline = await TransactionTimeline.find({ transactionId });

        if (!timeline) {
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
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Internal server error" });
    }
}

export const updateVerificationTimeline = async (req, res) => {
    try {
      const transactionId = req.transactionId;
      const performedByUserId = req.user?._id || req.params.userid; 

      const verifiedActivity = new TransactionTimeline({
        transactionId,
        performedByUserId,
        action: "verified",
      });

      await verifiedActivity.save();

      if (!verifiedActivity) {
        return res.status(404).json({ message: "Transaction Verified!, Activity couldn't be recorded" });
      }
    
      res.status(200).json({ message: "Transaction Verified successfully!" });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Internal server error" });
    }
}

export const updateTransactionDetailsTimeline = async (req, res) => {
    try {
      const transactionId = req.transactionId;
      const performedByUserId = req.user?._id || req.params.userid;

      const updatedActivity = new TransactionTimeline({
        transactionId,
        performedByUserId,
        action: "updated",
      });

      await updatedActivity.save();

      if (!updatedActivity) {
        return res.status(404).json({ message: "Activity couldn't be recorded" });
      }
    
      res.status(200).json({ message: "Transaction details updated successfully!" });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Internal server error" });
    }
}

