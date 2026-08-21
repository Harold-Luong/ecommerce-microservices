import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function verifyAccessToken(token) {
    return jwt.verify(token, env.jwt.accessSecret, { issuer: "auth-service", audience: "ecommerce-api" });
}
