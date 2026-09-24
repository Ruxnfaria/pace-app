# Profile + Progress — compatibilidade V1/V2

Data: 2026-09-22.

## Auditoria anterior à mudança

### Profile

`src/app/dashboard/profile/page.tsx` era um Client Component sem componentes,
hooks ou helpers de domínio próprios. Usava apenas o cliente Supabase do browser.

| Campo/valor | Antes | Edição/escrita antes | Classificação |
|---|---|---|---|
| `nome` | `profiles.nome` | editável; `profiles.nome` | UNIVERSAL |
| e-mail | `auth.getUser().email` | somente leitura | OTHER |
| `status_assinatura` | `profiles.status_assinatura` | somente leitura | UNIVERSAL |
| `peso` | `profiles.peso` | editável; `profiles.peso` | V1 FITNESS |
| `altura` | `profiles.altura` | editável; `profiles.altura` | V1 FITNESS |
| `objetivo` | `profiles.objetivo` | editável; `profiles.objetivo` | V1 FITNESS |
| `total_xp`, `level`, `streak` | `profiles` | somente leitura nesta página | UNIVERSAL |
| `last_activity_date` | selecionado, mas não exibido | nenhuma | UNIVERSAL |
| liga e XP semanal | `leaderboard` | somente leitura; estados não renderizados | UNIVERSAL |
| missões concluídas | contagem de `daily_missions` | somente leitura | DERIVED |
| treinos cadastrados | contagem de `workouts` | somente leitura | DERIVED |
| ranking, liga, título, username, iniciais e conquistas | derivados dos valores acima | somente leitura | DERIVED |
| avatar | apenas iniciais derivadas; os botões abriam o mesmo modal | nenhuma escrita de avatar | DERIVED |

O problema era semântico: um usuário marcado com `onboarding_version = 2`
continuava vendo e alterando somente os três campos fitness legados.

### Progress

`src/app/dashboard/progress/page.tsx` também era um Client Component e acessava o
Supabase diretamente. O contrato observado de `body_measurements` é:
`id`, `user_id`, `weight`, `waist`, `hip`, `chest`, `measured_at`.

- Cada envio inseria uma nova linha; portanto a tabela é histórico temporal, não
  snapshot.
- O histórico era ordenado por `measured_at` crescente.
- Havendo histórico, o primeiro registro era o peso inicial, o último era o peso
  atual e a evolução era a diferença entre eles.
- Sem histórico, `profiles.peso` gerava um ponto sintético `Inicial`.
- Depois do insert, a página atualizava `profiles.peso` como snapshot atual.
- Nenhum outro consumidor de `body_measurements` foi encontrado no código local.
- `profiles.peso` continua sendo consumido pelo contexto fitness somente no ramo
  V1 e, antes desta mudança, por Profile/Progress.

A criação original de `body_measurements` não está versionada neste repositório.
A inspeção catalogal remota de colunas, constraints, grants e policies foi
concluída em modo somente leitura e retornou `PROFILE_PROGRESS_RLS_PASS`.

## Regra implementada

### V1

- Profile lê e grava `profiles.peso`, `profiles.altura` e `profiles.objetivo`.
- Progress preserva inserts em `body_measurements` e atualiza `profiles.peso`.
- Havendo histórico, primeiro/último registro preservam baseline/peso atual.
- Sem histórico, `profiles.peso` continua sendo o baseline sintético.

### V2

- Profile lê peso, altura, meta de peso e objetivo de
  `user_health_profiles`; valores legados conflitantes nunca entram no modelo.
- A UI atual não exibe meta de peso, idade ou sexo; portanto não foram adicionados
  campos novos apenas por causa desta migração.
- Nome permanece editável em `profiles.nome`.
- Peso e altura são editáveis e gravados somente em
  `user_health_profiles.weight_kg` e `height_cm`, respeitando os limites das
  constraints (peso até 500 kg; altura até 300 cm).
- Objetivo é visível e somente leitura, com a indicação “Definido no seu perfil
  de treino”. Não existe hoje uma operação atômica que atualize simultaneamente
  `user_health_profiles.primary_goal` e `training_profiles.primary_goal`; por isso
  a página não altera nenhum dos dois.
- Progress mantém `body_measurements` como histórico e considera
  `user_health_profiles.weight_kg` o snapshot/peso atual.
- Ao registrar uma medição V2, insere a linha histórica e atualiza somente
  `user_health_profiles.weight_kg`; nunca escreve `profiles.peso`.
- O baseline V2 é a primeira medição histórica. Enquanto não existe histórico,
  `weight_kg` é usado como baseline provisório e ponto sintético `Inicial`.
- A evolução V2 é `weight_kg atual - primeira medição histórica`; sem histórico,
  é zero.
- Se o insert histórico funcionar e o update do snapshot falhar, a UI não declara
  sucesso: informa explicitamente o estado parcial, recarrega os dados e pede nova
  tentativa. Atomicidade completa exigiria uma RPC/transação nova, não criada
  nesta etapa.

## V2_INCOMPLETE

Se `profiles.onboarding_version = 2` e a linha health obrigatória estiver ausente
ou inválida, nenhuma tela usa `profiles.peso/altura/objetivo` como fallback.
Profile mantém os dados universais disponíveis, bloqueia os campos físicos e
mostra um aviso controlado. Progress bloqueia novas medições e mostra um aviso
controlado.

## RLS e arquitetura

As duas telas permanecem Client Components porque dependem de estado, gráficos e
modais. Reads/writes usam o cliente browser autenticado e RLS; a utility
`getUserFitnessContext`, marcada `server-only`, não foi importada no bundle.
A decisão V1/V2, os destinos de escrita e a regra de baseline foram extraídos
para `src/lib/profile-progress/model.ts`, sem I/O, para testes locais.

`user_health_profiles` tem RLS habilitada e policies `select_own`, `insert_own` e
`update_own`, todas limitadas por `auth.uid() = user_id`. O grant autenticado de
UPDATE inclui `weight_kg`, `height_cm`, `target_weight_kg` e `primary_goal`; esta
mudança usa somente peso e altura.

Para `body_measurements`, a página conserva exatamente as operações browser já
existentes (`SELECT` das próprias linhas e `INSERT` com `user_id` autenticado) e
não adiciona UPDATE/DELETE nem enfraquece RLS. A confirmação catalogal remota foi
concluída em modo somente leitura; o script manual usado na auditoria não integra
as migrations de produção.

## Validação concluída

- A auditoria RLS de Profile/Progress retornou `PROFILE_PROGRESS_RLS_PASS`.
- O smoke real V2.1 confirmou leitura das tabelas V2, conclusão persistida,
  receipt e markers coerentes.
- O endpoint temporário de inspeção foi removido; os consumidores usam o
  fitness-context centralizado e as guardas normais da aplicação.
- Nenhum UUID, e-mail ou payload do usuário de smoke é necessário para reproduzir
  o schema ou deve integrar o release.

## Readiness

- **Profile: READY.** Leitura e escrita V1 preservadas; V2 lê health, escreve
  canonicamente peso/altura e mantém objetivo seguro como somente leitura.
- **Progress: READY.** O modelo, os destinos de escrita e a proteção RLS foram
  validados. A UI sinaliza falha parcial porque não foi criada uma RPC
  transacional nova.

Onboarding V2.1 está ativo como padrão em `/onboarding`; o V1 permanece
disponível somente pelo rollback server-side `PRAXE_ONBOARDING_FLOW=v1` para
usuários ativos e ainda incompletos.
