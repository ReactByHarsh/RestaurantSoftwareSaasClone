ALTER TABLE users ADD COLUMN payment_received INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN renewal_payment_received INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN payment_note TEXT;
