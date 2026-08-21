ALTER TABLE users
ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user';

ALTER TABLE users
ADD CONSTRAINT users_role_check
CHECK (role IN ('user', 'admin'));

CREATE INDEX idx_users_role ON users(role);
