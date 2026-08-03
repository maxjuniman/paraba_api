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
  pushToken?: string | null;
  createdAt: string;
};

export type PublicUser = {
  id: string;
  nome: string;
  email: string;
  celular?: string;
  tipo: UserType;
  ativo: boolean;
  alunoId?: string | null;
};

export type Aluno = {
  id: string;
  nome: string;
  apelido?: string | null;
  foto?: string | null;
  emailResponsavel?: string;
  nomeResponsavel?: string | null;
  celular?: string;
  dataNascimento?: string;
  dataPagamento?: string | null;
  pagamentoPago?: boolean | null;
  pagamentoReferencia?: string | null;
  pagamentosPagos?: string[] | null;
  faixaAtual?: string | null;
  graus?: number | null;
  ativo?: boolean;
  userId?: string | null;
  user?: Pick<PublicUser, 'id' | 'nome' | 'email' | 'ativo'> | null;
  /** Data do cadastro do usuario no aplicativo (inicio da cobranca). */
  cadastroAppAt?: string | null;
  presencas?: Presenca[];
  totalPresencas?: number;
  ultimaPresenca?: string | null;
  createdAt: string;
};

export type Presenca = {
  id: string;
  alunoId: string;
  data: string;
  aulaId?: string | null;
  presente: boolean;
  markedAt: string;
  markedByUserId?: string | null;
};

export type PresencaDiaAluno = Aluno & {
  presente: boolean;
  presentePorAula?: Record<string, boolean>;
  presenca?: Presenca | null;
};

export type AulaCategoria = 'kids' | 'juvenil' | 'adulto';

export type AulaRecorrencia = 'avulsa' | 'recorrente';

export type PresencaAulaDoDia = {
  aulaId: string;
  hora: string;
  categorias: AulaCategoria[];
  tipoAula: {
    id: string;
    nome: string;
  };
};

export type PresencaDia = {
  data: string;
  aulas: PresencaAulaDoDia[];
  aulaSelecionada?: PresencaAulaDoDia | null;
  alunos: PresencaDiaAluno[];
};

export type VideoUpdate = {
  id: string;
  titulo: string;
  descricao?: string;
  url: string;
  alunoId?: string | null;
  createdAt: string;
};

export type TipoAula = {
  id: string;
  nome: string;
  createdAt: string;
};

export type AulaCalendario = {
  id: string;
  tipoAulaId: string;
  tipoAulaNome: string;
  diasSemana: number[];
  hora: string;
  categorias: AulaCategoria[];
  recorrencia: AulaRecorrencia;
  dataUnica?: string | null;
  createdAt: string;
};

export type Depoimento = {
  id: string;
  nome: string;
  texto: string;
  faixa?: string | null;
  userId?: string | null;
  ativo: boolean;
  ordem: number;
  createdAt: string;
};

export type Database = {
  users: User[];
  alunos: Aluno[];
  videos: VideoUpdate[];
  depoimentos: Depoimento[];
  presencas: Presenca[];
  tiposAula: TipoAula[];
  aulasCalendario: AulaCalendario[];
};
