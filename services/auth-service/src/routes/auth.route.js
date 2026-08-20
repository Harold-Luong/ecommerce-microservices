import { Router } from "express";
import { register, login, me, refresh, logout, logoutAll } from "../controllers/auth.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/register", register);

router.post("/login", login);

router.post("/refresh", refresh);

router.post("/logout", logout);

router.post("/logout-all", authenticate, logoutAll);

router.get("/me", authenticate, me);

export default router;
