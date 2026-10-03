# Testes locais do Onboarding V2.2

Os testes usam `node:test`, como os testes TypeScript existentes. Todos os dados
são sintéticos. Nenhum teste aceita URL de conexão, lê `.env`, usa credenciais do
Supabase ou conecta a um banco existente.

## Preparação isolada no Windows x64

Node 24 permite executar os arquivos TypeScript diretamente. Instale os runtimes
somente no cache ignorado, sem modificar `package.json` ou `package-lock.json` do
aplicativo:

```powershell
npm install --prefix node_modules/.cache/onboarding-v22/runtime --cache node_modules/.cache/onboarding-v22/npm --ignore-scripts --no-audit --no-fund --package-lock=false @embedded-postgres/windows-x64@17.6.0-beta.15 pg@8.16.3 @electric-sql/pglite@0.3.14
```

A instalação baixa pacotes públicos; a execução dos testes não usa rede externa.
O PostgreSQL 18.4 desse pacote falhou durante o post-bootstrap neste ambiente;
o harness usa o binário instalado, e a versão fixada acima é 17.6.

## Execução

```powershell
$testFiles = @(rg --files src -g '*.test.ts')
node --test @testFiles
node --test supabase/tests/onboarding-v22.integration.test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js src/app/onboarding/lib/onboarding-v22-contract.ts src/app/onboarding/lib/onboarding-v22-contract.test.ts supabase/tests/fixtures/onboarding-v22-payload.ts supabase/tests/local-postgres.mjs supabase/tests/onboarding-v22.integration.test.mjs
```

O harness cria um diretório novo `node_modules/.cache/onboarding-v22/pg-test-*`,
inicializa um cluster independente e escolhe uma porta livre em `127.0.0.1`.
O servidor é encerrado no `after` dos testes. Os arquivos do cluster permanecem
no cache para inspeção; nenhum arquivo de banco existente é removido.
`--no-sync`/`-F` são usados somente nesse cluster descartável: a suíte verifica
atomicidade transacional, não recuperação após queda de energia.

`fixtures/onboarding-baseline.sql` fornece apenas a infraestrutura anterior ao
histórico disponível (`auth`, roles, `profiles` e o helper de timestamps). As dez
migrations históricas do onboarding são carregadas integralmente, sem edição.
São criados usuários V1/V2.1 antes de exercitar a migration V2.2 nesse banco de teste.
Isso não substitui a revisão do schema/ACLs/triggers do ambiente alvo antes de uma
futura aplicação autorizada.

### Alternativa em memória

```powershell
$env:ONBOARDING_TEST_ENGINE = 'pglite'
node --test supabase/tests/onboarding-v22.integration.test.mjs
Remove-Item Env:ONBOARDING_TEST_ENGINE
```

PGlite executa PostgreSQL em WASM, sem serviço ou conexão TCP. Os cinco testes de
concorrência são **explicitamente pulados** nesse modo porque ele tem apenas uma
conexão. Um resultado PGlite não deve ser apresentado como evidência desses locks.

## Cobertura

- Mesmo conjunto de casos inválidos no builder TypeScript e na RPC autenticada.
- Payload fechado em todos os níveis; tipos, enums, datas, limites e duplicatas.
- Schema por versão, ausência de backfill, `NULL` para campos não coletados.
- Snapshot de todas as colunas antigas e da definição de `complete_onboarding_v2`.
- Replay V2.1 após a migration e todas as 51 combinações da classificação antiga.
- Canonicalização de todos os conjuntos, escalas numéricas e textos; SHA-256
  conferido independentemente pelo `node:crypto` sobre os bytes canônicos do SQL.
- Grants efetivos, `SECURITY DEFINER`, `search_path`, RLS e spoofing entre usuários.
- Falha injetada em cada tabela de domínio, receipt e markers; rollback também do nome.
- Markers gravados por último, com observação da ordem real dos writes.
- Concorrência com duas conexões e observador: replay, conflito, V2.1/V2.2 em ambas
  as ordens, rollback do vencedor e ausência de estado parcial visível.
- Reaplicação não é silenciosa: erro de coluna existente e rollback.

Todos os testes de banco são locais e descartáveis. Nunca execute os fixtures em
um banco Supabase ou em outro banco existente.
