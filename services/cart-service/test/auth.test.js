import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { authenticate } from "../src/middlewares/auth.middleware.js";
import { env } from "../src/config/env.js";

function responseMock() {
    return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test("authenticates an auth-service access token", () => {
    const token = jwt.sign({ sub: "42", email: "user@example.com", role: "user" }, env.jwt.accessSecret, {
        issuer: "auth-service", audience: "ecommerce-api", expiresIn: "1m",
    });
    const req = { headers: { authorization: `Bearer ${token}` } };
    authenticate(req, responseMock(), () => {});
    assert.deepEqual(req.auth, { userId: "42", email: "user@example.com", role: "user" });
});

test("rejects a missing access token", () => {
    const res = responseMock();
    authenticate({ headers: {} }, res, () => assert.fail("next must not be called"));
    assert.equal(res.statusCode, 401);
});
