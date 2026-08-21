import { Router } from "express";
import { create, index, remove, show, update } from "../controllers/product.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { createProductSchema, idParamsSchema, listProductsSchema, updateProductSchema } from "../schemas/product.schema.js";

const router = Router();
router.get("/", validate(listProductsSchema, "query"), index);
router.get("/:id", validate(idParamsSchema, "params"), show);
router.post("/", authenticate, authorize("admin"), validate(createProductSchema), create);
router.patch("/:id", authenticate, authorize("admin"), validate(idParamsSchema, "params"), validate(updateProductSchema), update);
router.delete("/:id", authenticate, authorize("admin"), validate(idParamsSchema, "params"), remove);
export default router;
