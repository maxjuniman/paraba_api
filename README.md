# Paraba API

Backend inicial do aplicativo Paraba com login de professor/aluno autorizado, cadastro de aluno, lista de presenca diaria e equipe para alunos.

## Como rodar

```bash
npm install
copy .env.example .env
npm run dev
```

A API sobe por padrao em `http://localhost:8000`.

## Banco de dados

A API usa **somente PostgreSQL**. Nao existe mais `db.json`.

`DATABASE_URL` e obrigatorio:

```env
DATABASE_URL=postgres://usuario:senha@127.0.0.1:5432/paraba_api
DATABASE_SSL=false
```

Na subida e no comando `npm run migrate`, a API cria/atualiza automaticamente as tabelas e colunas faltantes, incluindo `users.ativo`.

Professores (`tipo = 1`) sao marcados como `ativo = true` na migration.

Para rodar manualmente:

```bash
npm run migrate
```

Ou via SQL:

```bash
psql "$DATABASE_URL" -f migrations/001_full_schema.sql
```

Em producao (VPS):

1. Configure `/opt/paraba-api/.env` com `DATABASE_URL`.
2. Faca deploy do codigo novo.
3. Remova o arquivo antigo, se ainda existir: `rm -f /opt/paraba-api/data/db.json`
4. Reinicie: `pm2 restart paraba-api --update-env`

Depois disso, cadastre novamente professor/alunos; eles vao aparecer nas tabelas `users` e `alunos`.

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

O professor deve existir na tabela `users` com `tipo = 1` e `ativo = true`.

Para gerar um hash de senha:

```bash
node -e "import('bcryptjs').then(async bcrypt => console.log(await bcrypt.hash('sua-senha', 10)))"
```

Exemplo de insert:

```sql
INSERT INTO users (id, nome, email, password_hash, tipo, ativo, aluno_id, created_at)
VALUES (
  'professor-1',
  'Professor',
  'professor@email.com',
  'HASH_GERADO',
  1,
  true,
  NULL,
  NOW()
);
```

## Observacao

Sem `DATABASE_URL`, a API nao sobe. Users e alunos ficam nas tabelas `users` e `alunos`.
