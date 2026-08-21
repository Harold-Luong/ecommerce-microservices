import { env } from "../config/env.js";

export async function request(url, options = {}, dependency) {
    try {
        const response = await fetch(url, {
            ...options,
            signal: AbortSignal.timeout(env.requestTimeoutMs),
        });
        const body = response.status === 204 ? null : await response.json().catch(() => null);
        if (!response.ok) {
            const error = new Error(body?.message || `${dependency} request failed`);
            error.statusCode = response.status >= 500 ? 502 : response.status;
            throw error;
        }
        return body?.data ?? null;
    } catch (error) {
        if (error.statusCode) throw error;
        const mapped = new Error(error.name === "TimeoutError" ? `${dependency} request timed out` : `${dependency} is unavailable`);
        mapped.statusCode = error.name === "TimeoutError" ? 504 : 502;
        throw mapped;
    }
}
