import { Router } from "express";
import { cancel, create, index, show } from "../controllers/order.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { listOrdersSchema, orderParamsSchema } from "../schemas/order.schema.js";

const router = Router();
router.use(authenticate);
router.post("/", create);
router.get("/", validate(listOrdersSchema, "query"), index);
router.get("/:id", validate(orderParamsSchema, "params"), show);
router.post("/:id/cancel", validate(orderParamsSchema, "params"), cancel);
export default router;
