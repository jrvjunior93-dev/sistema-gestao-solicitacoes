# RH/DP — digitação de Dias e Faltas (03/10/2026)

## Causa e correção local

Na tela anterior de envio de jornada, `Dias` e `Faltas` eram campos React
controlados. O `onChange` aplicava `Math.min` ao valor a cada tecla; se o limite
da competência/vínculo fosse zero, qualquer número digitado voltava para zero.
Mesmo com limite positivo, a transformação podia interferir na digitação de
números com mais de um algarismo.

Em `frontend/src/pages/RhDpJornada.jsx`, os dois `onChange` agora preservam o
texto digitado. Os atributos `min`, `max` e `step` permanecem, assim como o
aviso e o bloqueio de envio quando a quantidade ultrapassa o vínculo/período.
O backend continua validando os valores; nenhuma regra de pagamento foi
afrouxada. O novo formulário gerencial já aceitava digitação sem truncamento.

## Estado e validação

Alterados: `frontend/src/pages/RhDpJornada.jsx`, este handoff e
`docs/workspace/OWNERSHIP_ATIVO.md`. Sem banco, migration, EC2 ou Vercel
nesta etapa. O usuário solicitou commit/push na `refactor/frontend` em
03/10/2026. Validar o build do frontend e `git diff --check`.
Ambos foram executados com sucesso; o build manteve apenas os avisos já
existentes de Browserslist e tamanho de chunk.

Próximo passo exato: após o push, testar na tela de dev com uma competência que tenha dias
disponíveis e outra com limite zero. A primeira deve aceitar a digitação e
permitir envio válido; a segunda deve mostrar o limite e impedir o envio,
sem apagar a entrada. Publicar o frontend de dev conforme o fluxo da Vercel;
não há atualização de backend ou migration para esta correção.
