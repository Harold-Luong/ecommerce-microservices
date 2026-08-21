import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { authenticate } from "../src/middlewares/auth.middleware.js";
import { env } from "../src/config/env.js";

function responseMock() {
    return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test("keeps the access token for downstream cart authentication", () => {
    const token = jwt.sign({ sub: "2", email: "user@example.com", role: "user" }, env.jwt.accessSecret, {
        issuer: "auth-service", audience: "ecommerce-api", expiresIn: "1m",
    });
    const req = { headers: { authorization: `Bearer ${token}` } };
    authenticate(req, responseMock(), () => {});
    assert.equal(req.auth.userId, "2");
    assert.equal(req.auth.accessToken, token);
});
