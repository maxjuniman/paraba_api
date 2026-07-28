export type UserType = 1 | 2;

export type User = {
  id: string;
  nome: string;
  email: string;
  celular?: string;
  passwordHash: string;
  tipo: UserType;
  alunoId?: string | null;
  createdAt: string;
};

export type PublicUser = {
  id: string;
  nome: string;
  email: string;
  tipo: UserType;
  alunoId?: string | null;
};

export type Aluno = {
  id: string;
  nome: string;
  emailResponsavel?: string;
  celular?: string;
  dataNascimento?: string;
  dataPagamento?: string | null;
  userId?: string | null;
  user?: Pick<PublicUser, 'id' | 'nome' | 'email'> | null;
  createdAt: string;
};

export type VideoUpdate = {
  id: string;
  titulo: string;
  descricao?: string;
  url: string;
  alunoId?: string | null;
  createdAt: string;
};

export type Database = {
  users: User[];
  alunos: Aluno[];
  videos: VideoUpdate[];
};
