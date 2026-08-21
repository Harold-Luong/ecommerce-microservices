import crypto from "node:crypto";
import { env } from "../config/env.js";

export function authenticateInternal(req, res, next) {
    const supplied = req.headers["x-internal-api-key"];
    if (typeof supplied !== "string") return res.status(401).json({ message: "Internal API key is required" });

    const actualBuffer = Buffer.from(env.internalApiKey);
    const suppliedBuffer = Buffer.from(supplied);
    if (actualBuffer.length !== suppliedBuffer.length || !crypto.timingSafeEqual(actualBuffer, suppliedBuffer)) {
        return res.status(401).json({ message: "Invalid internal API key" });
    }
    return next();
}
