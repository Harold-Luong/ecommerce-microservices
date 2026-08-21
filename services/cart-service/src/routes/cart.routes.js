import { Router } from "express";
import { addItem, clear, removeItem, show, updateItem } from "../controllers/cart.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { addItemSchema, productParamsSchema, updateItemSchema } from "../schemas/cart.schema.js";

const router = Router();
router.use(authenticate);
router.get("/", show);
router.post("/items", validate(addItemSchema), addItem);
router.patch("/items/:productId", validate(productParamsSchema, "params"), validate(updateItemSchema), updateItem);
router.delete("/items/:productId", validate(productParamsSchema, "params"), removeItem);
router.delete("/", clear);
export default router;
