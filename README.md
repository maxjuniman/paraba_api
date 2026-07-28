# Paraba API

Backend inicial do aplicativo Paraba com login, cadastro de usuario aluno, autorizacao pelo professor, cadastro de aluno e atualizacoes de videos.

## Como rodar

```bash
npm install
copy .env.example .env
npm run dev
```

A API sobe por padrao em `http://localhost:8000`.

No app Expo, use:

```env
EXPO_PUBLIC_PARABA_API_URL=https://apiparaba.maxfoot.com.br/api
```

## Rotas

- `POST /api/auth/register`: cria usuario aluno desativado e aguarda autorizacao.
- `POST /api/auth/login`: autentica usuario e retorna sessao.
- `GET /api/users/pendentes`: lista usuarios alunos aguardando autorizacao.
- `POST /api/users/:userId/autorizar`: autoriza usuario e vincula a um aluno.
- `GET /api/alunos`: lista alunos cadastrados.
- `POST /api/alunos`: cadastra aluno.
- `POST /api/alunos/:alunoId/vincular-user`: vincula aluno a usuario.
- `PATCH /api/alunos/:alunoId/pagamento`: atualiza data de pagamento.
- `GET /api/videos`: lista videos publicados.
- `POST /api/videos`: publica atualizacao de video.

As rotas administrativas exigem `Authorization: Bearer <token>` de professor (`tipo: 1`).

## Professor manual

Usuarios alunos criados pelo app entram com `tipo: 2` e `ativo: false`. O professor deve existir manualmente no `data/db.json` com `tipo: 1` e `ativo: true`.

Para gerar um hash de senha:

```bash
node -e "import('bcryptjs').then(async bcrypt => console.log(await bcrypt.hash('sua-senha', 10)))"
```

Exemplo de usuario professor:

```json
{
  "id": "professor-1",
  "nome": "Professor",
  "email": "professor@email.com",
  "passwordHash": "HASH_GERADO",
  "tipo": 1,
  "ativo": true,
  "alunoId": null,
  "createdAt": "2026-07-28T00:00:00.000Z"
}
```

## Observacao

Esta primeira etapa usa `data/db.json` como armazenamento local. Quando for evoluir o projeto, o proximo passo natural e trocar esse arquivo por um banco como PostgreSQL, MySQL ou SQLite.
