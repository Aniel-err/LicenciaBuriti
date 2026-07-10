INSERT INTO "LicenseRule" ("id", "licenseType", "displayName", "deadlineDays", "validityDays", "requiresInspection", "requiredDocuments", "legalBasis", "isActive", "createdAt", "updatedAt")
VALUES
  ('rule-lua', 'LUA', 'Licenca Unica Ambiental', 30, 1460, true, ARRAY['CAR', 'Projeto ambiental', 'Memorial descritivo'], 'Lei Municipal 756/2024, art. 2', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rule-luar', 'LUAR', 'Licenca Unica Ambiental de Regularizacao', 45, 1460, true, ARRAY['CAR', 'PRADA', 'Termo de compromisso ambiental'], 'Lei Municipal 756/2024, art. 2', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rule-relua', 'RELUA', 'Renovacao da Licenca Unica Ambiental', 30, 1460, false, ARRAY['Licenca anterior', 'Relatorio de cumprimento de condicionantes'], 'Lei Municipal 756/2024, art. 2', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rule-aqc', 'AQC', 'Autorizacao de Queima Controlada', 20, 180, true, ARRAY['Croqui da area', 'Autorizacao do proprietario', 'Plano de controle'], 'Lei Municipal 756/2024, art. 2', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rule-li', 'LI', 'Licenca de Instalacao', 30, 1095, false, ARRAY['Projeto ambiental', 'ART'], 'Lei Municipal 756/2024, art. 2', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rule-lo', 'LO', 'Licenca de Operacao', 30, 1460, true, ARRAY['Relatorio de implantacao', 'Comprovante de condicionantes'], 'Lei Municipal 756/2024, art. 2', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('rule-loc', 'LOC', 'Licenca de Operacao Corretiva', 45, 1095, true, ARRAY['Relatorio ambiental', 'Plano de controle corretivo'], 'Lei Municipal 756/2024, art. 2', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("licenseType") DO NOTHING;
