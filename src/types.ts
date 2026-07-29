export type UserType = 1 | 2;

export type User = {
  id: string;
  nome: string;
  email: string;
  celular?: string;
  passwordHash: string;
  tipo: UserType;
  ativo: boolean;
  alunoId?: string | null;
  createdAt: string;
};

export type PublicUser = {
  id: string;
  nome: string;
  email: string;
  tipo: UserType;
  ativo: boolean;
  alunoId?: string | null;
};

export type Aluno = {
  id: string;
  nome: string;
  apelido?: string | null;
  emailResponsavel?: string;
  celular?: string;
  dataNascimento?: string;
  dataPagamento?: string | null;
  pagamentoPago?: boolean | null;
  pagamentoReferencia?: string | null;
  pagamentosPagos?: string[] | null;
  faixaAtual?: string | null;
  graus?: number | null;
  userId?: string | null;
  user?: Pick<PublicUser, 'id' | 'nome' | 'email' | 'ativo'> | null;
  presencas?: Presenca[];
  totalPresencas?: number;
  ultimaPresenca?: string | null;
  createdAt: string;
};

export type Presenca = {
  id: string;
  alunoId: string;
  data: string;
  presente: boolean;
  markedAt: string;
  markedByUserId?: string | null;
};

export type PresencaDiaAluno = Aluno & {
  presente: boolean;
  presenca?: Presenca | null;
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
  presencas: Presenca[];
};
