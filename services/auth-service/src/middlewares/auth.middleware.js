import { verifyAccessToken } from "../utils/jwt.js";

export function authenticate(req, res, next) {
    const authorization = req.headers.authorization;

    if (!authorization) {
        return res.status(401).json({
            message: "Authorization header is required",
        });
    }

    const [type, token] = authorization.split(" ");

    if (type !== "Bearer" || !token) {
        return res.status(401).json({
            message: "Invalid authorization format",
        });
    }

    try {
        const payload = verifyAccessToken(token);

        req.auth = {
            userId: payload.sub,
        };

        next();
    } catch {
        return res.status(401).json({
            message: "Invalid or expired access token",
        });
    }
}