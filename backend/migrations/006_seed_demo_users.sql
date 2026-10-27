INSERT INTO users (id, username, role, organisation, state)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'u_field_01', 'Field', 'VECDIM', 'Lagos'),
  ('00000000-0000-4000-8000-000000000002', 'u_field_02', 'Field', 'VECDIM', 'Kano'),
  ('00000000-0000-4000-8000-000000000003', 'u_field_03', 'Field', 'VECDIM', 'Osun'),
  ('00000000-0000-4000-8000-000000000011', 'u_vecdim_lagos', 'VECDIM', 'VECDIM', 'Lagos'),
  ('00000000-0000-4000-8000-000000000012', 'u_vecdim_kano', 'VECDIM', 'VECDIM', 'Kano'),
  ('00000000-0000-4000-8000-000000000013', 'u_vecdim_osun', 'VECDIM', 'VECDIM', 'Osun'),
  ('00000000-0000-4000-8000-000000000021', 'u_uniosun_01', 'UNIOSUN', 'UNIOSUN', NULL)
ON CONFLICT (username) DO UPDATE SET
  role = EXCLUDED.role,
  organisation = EXCLUDED.organisation,
  state = EXCLUDED.state;
