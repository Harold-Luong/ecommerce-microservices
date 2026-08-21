import { verifyAccessToken } from "../utils/jwt.js";

export function authenticate(req, res, next) {
    const authorization = req.headers.authorization;
    if (!authorization) return res.status(401).json({ message: "Authorization header is required" });

    const [type, token, extra] = authorization.trim().split(/\s+/);
    if (type !== "Bearer" || !token || extra) {
        return res.status(401).json({ message: "Invalid authorization format" });
    }

    try {
        const payload = verifyAccessToken(token);
        if (!payload.sub) throw new Error("Token subject is required");
        req.auth = { userId: payload.sub, email: payload.email, role: payload.role || "user" };
        return next();
    } catch {
        return res.status(401).json({ message: "Invalid or expired access token" });
    }
}
