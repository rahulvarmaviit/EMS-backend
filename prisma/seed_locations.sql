-- Seed office locations for testing
INSERT INTO locations (id, name, latitude, longitude, radius_meters, is_active, created_at)
VALUES 
  (gen_random_uuid(), 'Head Office', 28.6139, 77.2090, 100, true, NOW()),
  (gen_random_uuid(), 'Branch Office', 19.0760, 72.8777, 100, true, NOW()),
  (gen_random_uuid(), 'Remote Office', 12.9716, 77.5946, 100, true, NOW())
ON CONFLICT DO NOTHING;
