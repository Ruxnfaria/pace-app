# Onboarding V2.1 — ativação

`/onboarding` é um Server Component e executa o preflight na ordem:

1. sessão válida;
2. assinatura com `status_assinatura = ativo`;
3. marker universal `onboarding_completed`;
4. escolha server-side do fluxo para usuários incompletos elegíveis.

O padrão é V2.1. Para rollback temporário de aplicação, configure
`PRAXE_ONBOARDING_FLOW=v1` no ambiente do servidor e faça um novo deploy. A
variável não é pública nem controlável pelo cliente. Ela só muda o formulário
mostrado a usuários ativos e ainda incompletos; usuários concluídos, V1 ou V2,
continuam sendo enviados ao dashboard. O rollback não altera
`onboarding_version`, schema ou dados existentes.

O V2.1 conclui exclusivamente pela RPC `complete_onboarding_v2`, com a chave de
idempotência mantida em `sessionStorage` durante a tentativa. Respostas
`completed` e `replay` entram no estado visível “Finalizando seu cadastro...” e
executam exatamente uma navegação de documento completo com
`window.location.replace('/dashboard')`. Não há `router.refresh()` nem timeout;
um link para o dashboard permanece como contingência se a navegação falhar. O
rollback V1 usa a mesma navegação robusta após preservar sua escrita legada.

O smoke real V2.1 concluiu com persistência, receipt e markers válidos. O bug em
que a combinação `router.replace` + `router.refresh` podia deixar `/onboarding`
visualmente preto foi corrigido e a navegação automática até `/dashboard` foi
validada em navegador real, sem exigir recarga manual.
