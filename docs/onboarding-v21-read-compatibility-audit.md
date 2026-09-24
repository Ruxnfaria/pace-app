# Onboarding V2.1 — auditoria de compatibilidade de leitura V1/V2

Data da auditoria: 2026-09-22.

## Classificação

- **A**: já compatível com V2.
- **B**: usa somente dado universal que continua pertencendo a `profiles`.
- **C**: lia dado legado com equivalente V2 claro.
- **D**: depende de dado legado sem equivalente direto ou com semântica ambígua.
- **E**: não deve ser migrado neste bloco.

## Mapa de consumidores

| Arquivo | Consumidor | Dado/origem atual | Fonte V2 correta | Classe | Risco para V2 antes deste bloco / decisão |
|---|---|---|---|---|---|
| `src/app/api/workouts/generate/route.ts` | `POST` / prompt do Coach Lucas | `profiles.objetivo`, `nivel_experiencia`, `dias_treino`, `idade`, `sexo`, `peso`, `altura` | health + training + activities V2; idade derivada | C | Alto: defaults falsos e plano ignorando o perfil V2. Migrado. |
| `src/app/api/chat/route.ts` | `POST` / contexto do chat e ferramentas de treino/nutrição | `profiles.nome`, `peso`, `altura`, `objetivo` | nome universal + health/training/nutrition V2 | C | Alto: valores fictícios e recomendações sem restrições alimentares. Migrado. |
| `src/app/dashboard/profile/page.tsx` | `loadProfileData` e `handleSaveProfile` | V1 usa legado; V2 usa health e mantém objetivo somente leitura | health V2 para medidas/objetivo; `profiles` para universais | A/B/E | Migrado: peso/altura V2 têm escrita canônica; objetivo V2 não pode divergir de training. |
| `src/app/dashboard/progress/page.tsx` | peso inicial e registro de medidas | histórico em `body_measurements`; snapshot V1/V2 escolhido pela versão | primeira medição como baseline e health V2 como snapshot atual | A/B/E | Migrado: V2 atualiza `weight_kg` e nunca `profiles.peso`; V1 preservado. |
| `src/proxy.ts` | guarda de onboarding | `profiles.status_assinatura`, `onboarding_completed` | os mesmos marcadores universais | B/E | Sem risco de leitura fitness; não alterar proxy nesta fase. |
| `src/app/onboarding/page.tsx` | conclusão V1 | escrita dos sete campos legados e `onboarding_completed` | não aplicável | E | Escrita V1 deliberadamente preservada; não é consumidor de leitura. |
| `src/app/onboarding/lib/complete-onboarding-v2.ts` | conclusão V2 | RPC atômica | tabelas V2 + markers | A/E | Já compatível; não alterar escrita/RPC. |
| `src/app/api/nutrition/analyze/route.ts` | análise de refeição | somente descrição enviada | não exige perfil | E | Nenhum risco de compatibilidade; não é recomendação de plano pessoal. |
| `src/app/api/missions/generate/route.ts` | missões e energia | logs, plano ativo, `profiles.total_xp` | fontes operacionais + XP universal | B | Nenhum dado substituído pelo V2. |
| `src/app/dashboard/page.tsx` | dashboard | logs, planos, treinos; `profiles.nome`, `total_xp` | fontes operacionais + universais | B | Nenhum dado fitness legado identificado. |
| `src/app/dashboard/workouts/page.tsx` | listagem/conclusão | `workouts`, logs, missões, `profiles.total_xp` | fontes operacionais + XP universal | B | Nenhum dado substituído pelo V2. |
| `src/app/dashboard/nutrition/page.tsx` | plano/log nutricional | planos, logs, missões, `profiles.total_xp` | fontes operacionais + XP universal | B | Não lê preferências de onboarding. |
| `src/app/dashboard/badges/page.tsx` | badges | `profiles.total_xp` + badges/missões | XP universal | B | Nenhum. |
| `src/app/dashboard/ranks/page.tsx` | rank | `profiles.total_xp` | XP universal | B | Nenhum. |
| `src/app/dashboard/ranking/page.tsx` | ranking | `profiles.nome`, `total_xp` | universais | B | Nenhum. |
| `src/app/dashboard/missions/page.tsx` | missões/recompensas | missões, baús, `profiles.total_xp` | fontes operacionais + XP universal | B | Nenhum. |
| `src/app/dashboard/aria/page.tsx` | UI do chat | mensagens/anexos; chama `/api/chat` | compatibilidade fica na API | A/E | A UI não lê perfil diretamente. |
| `src/app/api/webhooks/perfectpay/route.ts` | assinatura | `profiles.status_assinatura` e dados comerciais | universal | B | Nenhum; service role preexistente e fora da camada fitness. |
| `src/lib/rewards/server.ts`, `src/lib/gamification/streaks.ts` | recompensas/streak | missões, baús, streak e XP | universais/operacionais | B | Nenhum; service role preexistente e não modificado. |

## Escritas auditadas

- O onboarding V1 continua gravando somente o contrato legado.
- O onboarding V2 continua gravando exclusivamente pela RPC existente.
- Perfil e progresso agora escolhem a escrita pela versão. V1 preserva os campos legados; V2 escreve peso/altura somente em health e nunca altera o objetivo duplicado.
- Treinos, planos nutricionais, logs, missões, XP, badges e assinatura são dados operacionais/universais, não cópias do onboarding V2.

## Arquitetura implementada

`src/lib/fitness-context/server.ts` é server-only, usa o cliente Supabase autenticado já existente e recebe explicitamente o `userId` validado pela rota. Primeiro lê `profiles.onboarding_version`. Para legado, consulta apenas `profiles`; para versão 2, consulta as três tabelas-pai V2 e suas coleções filhas sob RLS.

`src/lib/fitness-context/model.ts` contém o contrato normalizado e funções puras. Um V2 sem health, training ou nutrition lança `FitnessContextError` com código `V2_INCOMPLETE`; nunca recorre aos campos legados. Arrays-filhos vazios são válidos. Valores opcionais e os campos V2.1 `meals_per_day`, `accepts_eggs` e `accepts_dairy` permanecem `null`.

`src/lib/fitness-context/prompt.ts` apresenta o contexto aos consumidores de IA. Os códigos `fat_loss`, `hypertrophy` e `conditioning` recebem apenas rótulos humanos equivalentes; códigos históricos não são convertidos para outros objetivos.

## Estado de Profile e Progress

A decisão foi concluída e está detalhada em
`docs/profile-progress-v1-v2-readiness.md`. `user_health_profiles.weight_kg` é o
snapshot atual V2; `body_measurements` é o histórico. O objetivo V2 permanece
somente leitura até existir uma operação canônica atômica para health + training.
Profile e Progress deixam de bloquear a ativação. A auditoria RLS de
Profile/Progress e o smoke real V2.1 foram concluídos com sucesso; não há
fallback silencioso de V2 para campos fitness V1.
