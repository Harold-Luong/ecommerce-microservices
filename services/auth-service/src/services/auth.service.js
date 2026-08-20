import bcrypt from "bcrypt";
import { env } from "../config/env.js";
import { createUser, findUserByEmail, findUserById } from "../repositories/user.repository.js";
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from "../utils/jwt.js";
import { hashToken } from "../utils/token.js";
import {
    createRefreshSession, findRefreshSessionById, revokeRefreshSession, revokeAllRefreshSessionsByUserId
} from "../repositories/refresh-session.repository.js";

const SALT_ROUNDS = 12;

export async function registerUser({ email, password }) {
    const existingUser = await findUserByEmail(email);

    if (existingUser) {
        const error = new Error("Email already exists");
        error.statusCode = 409;
        throw error;
    }

    const passwordHash = await bcrypt.hash(
        password,
        SALT_ROUNDS,
    );

    return createUser({
        email,
        passwordHash,
    });
}

export async function loginUser({ email, password }) {
    const user = await findUserByEmail(email);

    if (!user) {
        const error = new Error("Invalid email or password");
        error.statusCode = 401;
        throw error;
    }

    if (!user.is_active) {
        const error = new Error("User is inactive");
        error.statusCode = 403;
        throw error;
    }

    const passwordMatched = await bcrypt.compare(
        password,
        user.password_hash,
    );

    if (!passwordMatched) {
        const error = new Error("Invalid email or password");
        error.statusCode = 401;
        throw error;
    }

    const accessToken = generateAccessToken(user);


    const {
        token: refreshToken,
        sessionId,
    } = generateRefreshToken(user);

    const refreshPayload = verifyRefreshToken(refreshToken);

    await createRefreshSession({
        id: sessionId,
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(refreshPayload.exp * 1000),
    });

    return {
        accessToken,
        refreshToken,
        tokenType: "Bearer",
        accessTokenExpiresIn: env.jwt.accessExpiresIn,
        refreshTokenExpiresIn: env.jwt.refreshExpiresIn,
    };
}

export async function getCurrentUser(userId) {
    const user = await findUserById(userId);

    if (!user) {
        const error = new Error("User no longer exists");
        error.statusCode = 401;
        throw error;
    }

    if (!user.is_active) {
        const error = new Error("User is inactive");
        error.statusCode = 403;
        throw error;
    }

    return user;
}

export async function refreshAccessToken(refreshToken) {
    let payload;

    try {
        payload = verifyRefreshToken(refreshToken);
    } catch {
        const error = new Error("Invalid or expired refresh token");
        error.statusCode = 401;
        throw error;
    }

    if (
        payload.type !== "refresh" ||
        !payload.jti ||
        !payload.sub
    ) {
        const error = new Error("Invalid refresh token");
        error.statusCode = 401;
        throw error;
    }

    const session = await findRefreshSessionById(
        payload.jti,
    );

    if (!session) {
        const error = new Error("Refresh session not found");
        error.statusCode = 401;
        throw error;
    }

    if (session.revoked_at) {
        const error = new Error("Refresh token has been revoked");
        error.statusCode = 401;
        throw error;
    }

    if (new Date(session.expires_at) <= new Date()) {
        const error = new Error("Refresh token has expired");
        error.statusCode = 401;
        throw error;
    }

    if (
        session.token_hash !== hashToken(refreshToken)
    ) {
        const error = new Error("Invalid refresh token");
        error.statusCode = 401;
        throw error;
    }

    const user = await findUserById(payload.sub);

    if (!user) {
        const error = new Error("User no longer exists");
        error.statusCode = 401;
        throw error;
    }

    if (!user.is_active) {
        const error = new Error("User is inactive");
        error.statusCode = 403;
        throw error;
    }

    // Refresh Token Rotation:
    // token cũ dùng xong thì revoke.
    await revokeRefreshSession(session.id);

    const accessToken = generateAccessToken(user);

    const { token: newRefreshToken, sessionId } = generateRefreshToken(user);

    const newPayload = verifyRefreshToken(newRefreshToken);

    await createRefreshSession({
        id: sessionId,
        userId: user.id,
        tokenHash: hashToken(newRefreshToken),
        expiresAt: new Date(newPayload.exp * 1000),
    });

    return {
        accessToken,
        refreshToken: newRefreshToken,
        tokenType: "Bearer",
        accessTokenExpiresIn: env.jwt.accessExpiresIn,
        refreshTokenExpiresIn: env.jwt.refreshExpiresIn,
    };
}

export async function logoutUser(refreshToken) {
    let payload;

    try {
        payload = verifyRefreshToken(refreshToken);
    } catch {
        const error = new Error("Invalid refresh token");
        error.statusCode = 401;
        throw error;
    }

    if (!payload.jti) {
        const error = new Error("Invalid refresh token");
        error.statusCode = 401;
        throw error;
    }

    const session = await findRefreshSessionById(
        payload.jti,
    );

    if (!session) {
        return;
    }

    if (session.revoked_at) {
        return;
    }

    await revokeRefreshSession(session.id);
}

export async function logoutAllUser(userId) {
    await revokeAllRefreshSessionsByUserId(userId);
}
