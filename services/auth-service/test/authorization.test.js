import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

import { authenticate, authorize } from "../src/middlewares/auth.middleware.js";
import { env } from "../src/config/env.js";
import { generateAccessToken, verifyAccessToken } from "../src/utils/jwt.js";

function responseMock() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };
}

test("access token contains the user role", () => {
    const token = generateAccessToken({ id: 1, email: "admin@example.com", role: "admin" });
    assert.equal(verifyAccessToken(token).role, "admin");
});

test("authenticate exposes role from access token", () => {
    const token = jwt.sign({ sub: "1", email: "user@example.com", role: "user" }, env.jwt.accessSecret, {
        issuer: "auth-service", audience: "ecommerce-api", expiresIn: "1m",
    });
    const req = { headers: { authorization: `Bearer ${token}` } };
    authenticate(req, responseMock(), () => {});
    assert.deepEqual(req.auth, { userId: "1", email: "user@example.com", role: "user" });
});

test("authorize rejects a role without permission", () => {
    const req = { auth: { role: "user" } };
    const res = responseMock();
    authorize("admin")(req, res, () => assert.fail("next must not be called"));
    assert.equal(res.statusCode, 403);
});
