-- Role ứng dụng: không bypass RLS. Mật khẩu dev; production đặt lại bằng ALTER ROLE.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kb_app') THEN
    CREATE ROLE kb_app LOGIN PASSWORD 'kb_app';
  END IF;
END $$;
GRANT CONNECT ON DATABASE khaibao TO kb_app;

-- Role khu Quản trị hệ thống (ADR 0006): BYPASSRLS, chỉ DML (quyền bảng cấp trong runMigrations).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kb_platform') THEN
    CREATE ROLE kb_platform LOGIN BYPASSRLS PASSWORD 'kb_app';
  END IF;
END $$;
GRANT CONNECT ON DATABASE khaibao TO kb_platform;
