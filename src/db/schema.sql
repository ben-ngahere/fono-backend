CREATE TABLE IF NOT EXISTS fono_items (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- Index for faster lookups by user_id
CREATE INDEX IF NOT EXISTS idx_fono_items_user_id ON fono_items (user_id);

CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    sender_id VARCHAR(255) NOT NULL,    
    receiver_id VARCHAR(255),           
                              
    encrypted_content TEXT NOT NULL,   
    iv TEXT NOT NULL,                   
    auth_tag TEXT NOT NULL,
    read_status BOOLEAN DEFAULT FALSE,
    message_type VARCHAR(50) DEFAULT 'text',             
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON chat_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_receiver_id ON chat_messages (receiver_id);
