CREATE TABLE refresh_sessions (
    id UUID PRIMARY KEY,

    user_id BIGINT NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    token_hash VARCHAR(64) NOT NULL UNIQUE,

    expires_at TIMESTAMPTZ NOT NULL,

    revoked_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_sessions_user_id
ON refresh_sessions(user_id);

CREATE INDEX idx_refresh_sessions_expires_at
ON refresh_sessions(expires_at);
