import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../../', import.meta.url));
const runtime = resolve(root, 'node_modules/.cache/onboarding-v22/runtime');
const requireRuntime = createRequire(join(runtime, 'package.json'));

/** No connection URL/env credentials accepted. Always initializes a new local
 * cluster under the ignored cache and binds only to loopback on a free port.
 * Leaves its files for inspection and stops the process at the end of the test.
 */
export async function startLocalPostgres() {
  if (process.env.ONBOARDING_TEST_ENGINE === 'pglite') {
    const { PGlite } = requireRuntime('@electric-sql/pglite');
    const memory = new PGlite();
    return {
      db: { query: async (sql, args) => args ? memory.query(sql, args) : (await memory.exec(sql)).at(-1) },
      stop: () => memory.close(),
    };
  }
  const { Client } = requireRuntime('pg');
  const platform = process.platform === 'win32' ? 'windows-x64' : `${process.platform}-${process.arch}`;
  const binaryDir = join(runtime, 'node_modules', '@embedded-postgres', platform, 'native', 'bin');
  const binary = (name) => join(binaryDir, name + (process.platform === 'win32' ? '.exe' : ''));
  const cache = resolve(root, 'node_modules/.cache/onboarding-v22');
  await mkdir(cache, { recursive: true });
  const dataDir = await mkdtemp(join(cache, 'pg-test-'));
  const initialized = spawnSync(binary('initdb'), ['-D', dataDir, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C', '--no-sync'],
    { windowsHide: true, encoding: 'utf8', timeout: 60000 });
  if (initialized.error || initialized.status !== 0) throw new Error(`Local initdb failed: ${initialized.error ?? initialized.stderr}\n${initialized.stdout}`);
  const port = await new Promise((accept, reject) => {
    const probe = net.createServer(); probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => { const port = probe.address().port; probe.close(() => accept(port)); });
  });
  const server = spawn(binary('postgres'), ['-D', dataDir, '-h', '127.0.0.1', '-p', String(port), '-F',
    '-c', 'log_statement=none', '-c', 'log_min_error_statement=panic', '-c', 'log_min_messages=panic'],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let serverError = ''; server.stderr.on('data', (chunk) => { serverError = (serverError + chunk).slice(-4000); });
  server.on('error', (error) => { serverError = error.message; });
  const clients = new Set();
  const connect = async () => {
    const client = new Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres',
      password: '', ssl: false, connectionTimeoutMillis: 2000, statement_timeout: 15000 });
    await client.connect(); clients.add(client); return client;
  };
  const stop = async () => {
    await Promise.allSettled([...clients].map((client) => client.end()));
    const stopped = spawnSync(binary('pg_ctl'), ['stop', '-D', dataDir, '-m', 'immediate', '-w', '-t', '10'],
      { windowsHide: true, encoding: 'utf8' });
    if (stopped.error || stopped.status !== 0) {
      server.kill(); throw new Error(`Local postgres cleanup failed: ${stopped.error ?? stopped.stderr}`);
    }
  };
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const db = await connect();
      return { db, connect, stop, dataDir, port };
    } catch {
      if (server.exitCode !== null || attempt === 99) {
        await stop(); throw new Error(`Local postgres did not start: ${serverError}`);
      }
      await delay(100);
    }
  }
}

export const readMigration = (name) => readFile(resolve(root, 'supabase/migrations', name), 'utf8');
export async function loadV21Foundation(db) {
  await db.query(await readFile(new URL('./fixtures/onboarding-baseline.sql', import.meta.url), 'utf8'));
  for (const file of [
    '20260912000100_add_onboarding_version_foundation.sql',
    '20260913000200_create_training_profiles.sql',
    '20260913000600_create_nutrition_profiles.sql',
    '20260913000900_create_nutrition_profile_details.sql',
    '20260914000200_create_user_health_profiles.sql',
    '20260914000400_create_onboarding_completion_receipts.sql',
    '20260914000700_add_nutrition_egg_dairy_acceptance.sql',
    '20260914001000_protect_profiles_onboarding_v2_markers.sql',
    '20260914001100_create_complete_onboarding_v2_rpc.sql',
    '20260921000100_onboarding_v21_contract.sql',
  ]) await db.query(await readMigration(file));
}
