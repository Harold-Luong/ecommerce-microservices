import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { authenticate, authorize } from "../src/middlewares/auth.middleware.js";
import { env } from "../src/config/env.js";

function responseMock() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };
}

function accessToken(role) {
    return jwt.sign({ sub: "1", email: "user@example.com", role }, env.jwt.accessSecret, {
        issuer: "auth-service", audience: "ecommerce-api", expiresIn: "1m",
    });
}

test("authenticate exposes role from auth-service token", () => {
    const req = { headers: { authorization: `Bearer ${accessToken("admin")}` } };
    authenticate(req, responseMock(), () => {});
    assert.equal(req.auth.role, "admin");
});

test("admin is authorized to mutate products", () => {
    let called = false;
    authorize("admin")({ auth: { role: "admin" } }, responseMock(), () => { called = true; });
    assert.equal(called, true);
});

test("user is forbidden from mutating products", () => {
    const res = responseMock();
    authorize("admin")({ auth: { role: "user" } }, res, () => assert.fail("next must not be called"));
    assert.equal(res.statusCode, 403);
});
