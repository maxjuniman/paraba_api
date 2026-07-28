# Paraba API

Backend inicial do aplicativo Paraba com login, cadastro, cadastro de aluno e atualizacoes de videos.

## Como rodar

```bash
npm install
copy .env.example .env
npm run dev
```

A API sobe por padrao em `http://localhost:8000`.

No app Expo, use:

```env
EXPO_PUBLIC_PARABA_API_URL=http://127.0.0.1:8000/api
```

## Rotas

- `POST /api/auth/register`: cria usuario e retorna sessao.
- `POST /api/auth/login`: autentica usuario e retorna sessao.
- `GET /api/alunos`: lista alunos cadastrados.
- `POST /api/alunos`: cadastra aluno.
- `POST /api/alunos/:alunoId/vincular-user`: vincula aluno a usuario.
- `PATCH /api/alunos/:alunoId/pagamento`: atualiza data de pagamento.
- `GET /api/videos`: lista videos publicados.
- `POST /api/videos`: publica atualizacao de video.

As rotas de alunos e videos exigem `Authorization: Bearer <token>`.

## Observacao

Esta primeira etapa usa `data/db.json` como armazenamento local. Quando for evoluir o projeto, o proximo passo natural e trocar esse arquivo por um banco como PostgreSQL, MySQL ou SQLite.
