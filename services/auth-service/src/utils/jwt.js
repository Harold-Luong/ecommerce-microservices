import crypto from "node:crypto";
import jwt from "jsonwebtoken";

import { env } from "../config/env.js";

const ACCESS_ISSUER = "auth-service";
const ACCESS_AUDIENCE = "ecommerce-api";

const REFRESH_ISSUER = "auth-service";
const REFRESH_AUDIENCE = "auth-service";

export function generateAccessToken(user) {
    return jwt.sign(
        {
            sub: String(user.id),
            email: user.email,
            role: user.role,
        },
        env.jwt.accessSecret,
        {
            expiresIn: env.jwt.accessExpiresIn,
            issuer: ACCESS_ISSUER,
            audience: ACCESS_AUDIENCE,
        },
    );
}

export function verifyAccessToken(token) {
    return jwt.verify(
        token,
        env.jwt.accessSecret,
        {
            issuer: ACCESS_ISSUER,
            audience: ACCESS_AUDIENCE,
        },
    );
}

export function generateRefreshToken(user) {
    const sessionId = crypto.randomUUID();

    const token = jwt.sign(
        {
            sub: String(user.id),
            type: "refresh",
        },
        env.jwt.refreshSecret,
        {
            jwtid: sessionId,
            expiresIn: env.jwt.refreshExpiresIn,
            issuer: REFRESH_ISSUER,
            audience: REFRESH_AUDIENCE,
        },
    );

    return {
        token,
        sessionId,
    };
}

export function verifyRefreshToken(token) {
    const payload = jwt.verify(
        token,
        env.jwt.refreshSecret,
        {
            issuer: REFRESH_ISSUER,
            audience: REFRESH_AUDIENCE,
        },
    );

    if (payload.type !== "refresh") {
        throw new Error("Invalid refresh token type");
    }

    return payload;
}
