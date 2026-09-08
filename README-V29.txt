VetCore Estoque v29 — Produção Vercel + Neon

Base:
- Mantém CMS e visual VetCore da v25.
- Mantém o perfil Estoque da v28.
- Login Estoque redireciona para /estoque.html.
- Saída por EAN/código, busca por lista e histórico.
- Senhas com scrypt.
- Sessão por cookie assinado, compatível com Vercel serverless.
- Persistência no Neon PostgreSQL via DATABASE_URL.
- Em ambiente local sem DATABASE_URL, continua usando data/db.json.
- Vercel preparado por Express em server.js com export do app; a Vercel detecta o projeto automaticamente.

Variáveis obrigatórias no Vercel:
DATABASE_URL=<connection string do Neon>
SESSION_SECRET=<uma chave longa e aleatória>

Login inicial:
admin
Vetcore@2026

O banco Neon é inicializado automaticamente na primeira execução com a tabela vetcore_state.
Se a tabela estiver vazia, os dados iniciais de data/db.json são usados como seed.
