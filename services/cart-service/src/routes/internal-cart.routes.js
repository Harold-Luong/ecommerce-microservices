import { Router } from "express";
import { consume } from "../controllers/internal-cart.controller.js";
import { authenticateInternal } from "../middlewares/internal-auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { consumeCartSchema } from "../schemas/cart.schema.js";

const router = Router();
router.use(authenticateInternal);
router.post("/consume", validate(consumeCartSchema), consume);
export default router;
