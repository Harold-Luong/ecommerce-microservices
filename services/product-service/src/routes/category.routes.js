import { Router } from "express";
import { create, index } from "../controllers/category.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { createCategorySchema } from "../schemas/category.schema.js";

const router = Router();
router.get("/", index);
router.post("/", authenticate, authorize("admin"), validate(createCategorySchema), create);
export default router;
