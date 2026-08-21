import { Router } from "express";
import { release, reserve } from "../controllers/inventory.controller.js";
import { authenticateInternal } from "../middlewares/internal-auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { orderParamsSchema, reserveInventorySchema } from "../schemas/inventory.schema.js";

const router = Router();
router.use(authenticateInternal);
router.post("/reservations", validate(reserveInventorySchema), reserve);
router.post("/reservations/:orderId/release", validate(orderParamsSchema, "params"), release);
export default router;
