import { verifyAccessToken } from "../utils/jwt.js";

export function authenticate(req, res, next) {
    const authorization = req.headers.authorization;

    if (!authorization) {
        return res.status(401).json({ message: "Authorization header is required" });
    }

    const [type, token, extra] = authorization.trim().split(/\s+/);
    if (type !== "Bearer" || !token || extra) {
        return res.status(401).json({ message: "Invalid authorization format" });
    }

    try {
        const payload = verifyAccessToken(token);
        req.auth = {
            userId: payload.sub,
            email: payload.email,
            role: payload.role || "user",
        };
        return next();
    } catch {
        return res.status(401).json({ message: "Invalid or expired access token" });
    }
}

export function authorize(...allowedRoles) {
    return (req, res, next) => {
        if (!req.auth) {
            return res.status(401).json({ message: "Authentication is required" });
        }

        if (!allowedRoles.includes(req.auth.role)) {
            return res.status(403).json({
                message: "You do not have permission to perform this action",
            });
        }

        return next();
    };
}
