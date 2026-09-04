-- Invite-only console users. Passwords are stored as scrypt hashes by the simulator.
CREATE TABLE IF NOT EXISTS smoke_auth_users (
  email TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'CUSTOMER_USER',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
