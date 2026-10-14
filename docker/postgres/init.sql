-- Role ứng dụng: không bypass RLS. Mật khẩu dev; production đặt lại bằng ALTER ROLE.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kb_app') THEN
    CREATE ROLE kb_app LOGIN PASSWORD 'kb_app';
  END IF;
END $$;
GRANT CONNECT ON DATABASE khaibao TO kb_app;
