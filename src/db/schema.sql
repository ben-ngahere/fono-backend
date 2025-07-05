CREATE TABLE IF NOT EXISTS fono_items (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- index for faster lookups by user_id
CREATE INDEX IF NOT EXISTS idx_fono_items_user_id ON fono_items (user_id);