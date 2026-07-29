# Paraba API

Backend inicial do aplicativo Paraba com login de professor/aluno autorizado, cadastro de aluno, lista de presenca diaria e equipe para alunos.

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

- `POST /api/auth/register`: cadastro de usuario tipo 2 para autorizacao pelo professor.
- `POST /api/auth/login`: autentica usuario e retorna sessao.
- `GET /api/equipe`: lista dados publicos dos alunos, apenas para usuario tipo 2.
- `GET /api/users/pendentes`: lista usuarios alunos aguardando autorizacao.
- `POST /api/users/:userId/autorizar`: autoriza usuario e vincula a um aluno.
- `GET /api/alunos`: lista alunos cadastrados.
- `POST /api/alunos`: cadastra aluno.
- `PATCH /api/alunos/:alunoId`: edita informacoes do aluno.
- `POST /api/alunos/:alunoId/vincular-user`: vincula aluno a usuario.
- `PATCH /api/alunos/:alunoId/pagamento`: atualiza data de pagamento.
- `GET /api/presencas?data=AAAA-MM-DD`: lista os alunos do dia com status de presenca.
- `PATCH /api/presencas/:data/alunos/:alunoId/toggle`: marca/desmarca presenca do aluno no dia.
- `GET /api/videos`: lista videos publicados, desabilitado por padrao.
- `POST /api/videos`: publica atualizacao de video, desabilitado por padrao.

As rotas funcionais exigem `Authorization: Bearer <token>` de professor (`tipo: 1`).
O cadastro de aluno exige `dataNascimento` no formato `AAAA-MM-DD`.
O campo `foto` do aluno e opcional e aceita uma URL ou data URI/base64.
Para desabilitar cadastro tipo 2, use `ENABLE_STUDENT_REGISTRATION=false`.
Para reabilitar videos no futuro, use `ENABLE_VIDEOS=true`.

## Categorias de alunos

Os limites ficam em `src/config/studentCategories.ts`:

- `kids`: 0 a 10 anos.
- `juvenil`: 11 a 18 anos.
- `adulto`: 19 anos ou mais.

## Professor manual

Nesta etapa, o professor deve existir manualmente no `data/db.json` com `tipo: 1` e `ativo: true`.

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
