-- Bỏ loại skill MAPPING (spec 2026-10-15 C7): ánh xạ chỉ tiêu tờ khai cấu hình ở Cài đặt → Khai báo (declaration_profiles).
-- skill_versions / skill_samples / skill_evaluations xóa theo khóa ngoại ON DELETE CASCADE.
DELETE FROM "skills" WHERE "kind" = 'MAPPING';
