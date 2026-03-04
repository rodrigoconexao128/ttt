# Avaliação: Kanban — Restauração e Validação

Data: 2026-01-09

Resumo:
- Problema: a tabela `kanban_stages` foi removida durante otimizações no Supabase, removendo os estágios predefinidos.
- Ação: aplicada migration para recriar `kanban_stages` com schema completo e políticas RLS.
- Verificação: reiniciado o servidor de desenvolvimento; a rota `GET /api/kanban/stages` recria automaticamente os estágios padrões se o usuário não tiver nenhum.
- Teste UI: via front-end criei uma nova etapa "Etapa de Teste" (cor verde) usando o modal "Nova Etapa" — notificação "Etapa criada!" exibida e coluna criada.
- Persistência: consulta ao banco confirmou o registro da nova etapa (posição 5, `is_default: false`).
- Observação: foram geradas linhas duplicadas dos estágios padrão (Novos, Prospectando, Negociando, Fechado, Perdido) — precisa deduplicação ou tornar a criação idempotente.

Próximos passos recomendados:
1. Tornar idempotente a criação de estágios padrão em `GET /api/kanban/stages` (verificar existência por `user_id` e `name` antes de inserir).
2. Rodar limpeza/deduplicação nas linhas duplicadas existentes na tabela `kanban_stages` (script de migração/rollback).
3. Executar suíte de testes automatizados para Kanban: criar, atualizar, deletar, reordenar, isolamento por usuário e verificação de RLS.
4. Se desejar, criar um PR com este arquivo de avaliação para registro e revisão no GitHub.

Status atual:
- Migração aplicada: concluído
- Teste criar etapa (UI → backend → DB): concluído
- Deduplicação e testes completos: pendente

Referências técnicas:
- Supabase project id: bnfpcuzjvycudccycqqt
- Arquivo relevante do backend: `vvvv/server/routes.ts` (roteiro de criação automática de estágios padrão)
- Migration aplicada: `create_kanban_stages_table` (schema + RLS)

Autor: equipe de desenvolvimento
