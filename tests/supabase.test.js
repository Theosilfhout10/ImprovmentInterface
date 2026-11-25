/*
 * Test van de Supabase-database (supabase/installatie.sql) op een lokale PostgreSQL.
 * Draait alleen als VBR_PG_URL is gezet (zoals in GitHub Actions), anders wordt hij overgeslagen.
 * Voorbeeld: VBR_PG_URL=postgres://postgres:postgres@localhost:5432/postgres npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const url = process.env.VBR_PG_URL;
const psql = (args, db) => execFileSync('psql', [db || url, '-v', 'ON_ERROR_STOP=1', '-q', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

test('Supabase-database: schema, rechten en bedrijfsregels', { skip: !url && 'VBR_PG_URL niet gezet' }, () => {
  const testDb = url.replace(/\/[^/?]*(\?|$)/, '/vbr_test$1');
  psql(['-c', 'drop database if exists vbr_test', '-c', 'create database vbr_test']);
  psql(['-f', path.join(__dirname, 'supabase', 'mock-supabase.sql')], testDb);
  psql(['-f', path.join(__dirname, '..', 'supabase', 'installatie.sql')], testDb);
  psql(['-f', path.join(__dirname, '..', 'supabase', 'installatie.sql')], testDb); // opnieuw uitvoerbaar
  let uitvoer;
  try {
    uitvoer = execFileSync('psql', [testDb, '-v', 'ON_ERROR_STOP=1', '-q', '-f', path.join(__dirname, 'supabase', 'test.sql')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { assert.fail(e.stderr || e.message); }
  assert.ok(true, uitvoer);
});
