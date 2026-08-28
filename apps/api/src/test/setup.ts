// Test ortamı için gerekli environment değişkenleri
process.env['DATABASE_URL'] = 'postgresql://user:password@localhost:5432/panel_test';
process.env['JWT_SECRET'] = 'test-jwt-secret-minimum-32-characters-long';
process.env['JWT_REFRESH_SECRET'] = 'test-jwt-refresh-secret-minimum-32-chars';
process.env['JWT_TEMP_SECRET'] = 'test-jwt-temp-secret-minimum-32-chars-xx';
process.env['TOTP_ENCRYPTION_KEY'] = '0000000000000000000000000000000000000000000000000000000000000000';
process.env['PORT'] = '3001';
process.env['NODE_ENV'] = 'test';
process.env['FRONTEND_URL'] = 'http://localhost:3001';
