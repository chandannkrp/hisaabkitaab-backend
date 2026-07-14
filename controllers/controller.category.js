import { Category } from "../models/model.categories.js";
import { asyncHandler } from "../middlewares/middleware.asyncHandler.js";

export const getCategories = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  //Fetch all categories created by the user
  const categories = await Category.find({ createdBy: userId }).populate(
    "clients",
    "name email"
  );

  //Check if the user has any categories
  if (categories.length === 0) {
    return res.status(404).json({ message: "No categories found" });
  }

  res.status(200).json(categories);
});

export const createCategory = asyncHandler(async (req, res) => {
  const { name, categoryClients } = req.body;
  const userId = req.user._id;

  //Check if category exists
  const categoryExists = await Category.findOne({
    categoryId: `catg-${name}-${userId}`,
  });

  if (categoryExists) {
    return res.status(400).json({ message: "Category already exists" });
  }

  //Create the category
  const category = await Category.create({
    name,
    categoryId: `catg-${name}-${userId}`,
    createdBy: userId,
    clients: categoryClients,
  });

  res.status(201).json({
    message: "Category created successfully",
    category,
  });
});

export const deleteCategoryById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  //Check if category exists
  const categoryExists = await Category.findOne({
    categoryId: `catg-${id}-${userId}`,
    createdBy: userId,
  });

  if (!categoryExists) {
    return res.status(404).json({ message: "Category not found" });
  }

  //Delete the category
  const deletedCategory = await Category.findOneAndDelete({
    categoryId: `catg-${id}-${userId}`,
    createdBy: userId,
  });

  res.status(200).json({
    message: "Category deleted successfully",
    deletedCategory,
  });
});
