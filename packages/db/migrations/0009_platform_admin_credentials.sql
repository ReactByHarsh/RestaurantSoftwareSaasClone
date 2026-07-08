UPDATE users
SET
  name = 'BSS Cloud Admin',
  email = 'bss@gmail.com',
  password_hash = 'bss123',
  updated_at = datetime('now')
WHERE id = 'usr_super_admin';
