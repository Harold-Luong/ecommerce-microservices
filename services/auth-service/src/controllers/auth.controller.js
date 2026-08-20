import { registerUser, loginUser, getCurrentUser, refreshAccessToken, logoutUser, logoutAllUser } from "../services/auth.service.js";
import { findUserById } from "../repositories/user.repository.js";

export async function register(req, res, next) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required",
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                message: "Password must be at least 8 characters",
            });
        }

        const user = await registerUser({
            email: email.trim().toLowerCase(),
            password,
        });

        return res.status(201).json({
            message: "User registered successfully",
            data: user,
        });
    } catch (error) {
        next(error);
    }
}

export async function login(req, res, next) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required",
            });
        }

        const auth = await loginUser({
            email: email.trim().toLowerCase(),
            password,
        });

        return res.status(200).json({
            message: "Login successful",
            data: auth,
        });
    } catch (error) {
        next(error);
    }
}

export async function me(req, res, next) {
    try {
        const user = await getCurrentUser(req.auth.userId);

        return res.status(200).json({
            data: user,
        });
    } catch (error) {
        next(error);
    }
}

export async function refresh(req, res, next) {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                message: "Refresh token is required",
            });
        }

        const auth = await refreshAccessToken(refreshToken);

        return res.status(200).json({
            message: "Access token refreshed",
            data: auth,
        });
    } catch (error) {
        next(error);
    }
}

export async function logout(req, res, next) {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                message: "Refresh token is required",
            });
        }

        await logoutUser(refreshToken);

        return res.status(200).json({
            message: "Logout successful",
        });
    } catch (error) {
        next(error);
    }
}


export async function logoutAll(req, res, next) {
    try {
        await logoutAllUser(req.auth.userId);

        return res.status(200).json({
            message: "Logged out from all devices successfully",
        });
    } catch (error) {
        next(error);
    }
}
