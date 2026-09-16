// Formato devolvido por public.pacote_offline_instalacoes() (migration
// 20260916010000) — espelha exatamente o jsonb_build_object da RPC.
export type PacoteItem = {
  id: string;
  pedido_item_id: string;
  item_codigo: string;
  item_descricao: string;
  quantidade: number;
  quantidade_instalada: number;
  quantidade_pendente: number;
};

export type PacoteOcorrencia = { id: string; descricao: string; registrado_em: string };

export type PacoteDano = {
  id: string;
  instalacao_item_id: string;
  quantidade: number;
  causa: "fabricacao" | "transporte" | "instalacao" | "cliente" | "indeterminada";
  descricao: string | null;
  registrado_em: string;
};

export type PacoteInstalacao = {
  id: string;
  numero: string;
  status: "agendada" | "em_execucao" | "concluida";
  data_agendada: string;
  observacoes: string | null;
  equipe_id: string;
  pedido: { id: string; numero: string };
  pessoa: { nome: string };
  obra: { id: string; nome: string; logradouro: string | null; cidade: string | null; uf: string | null; cep: string | null } | null;
  itens: PacoteItem[];
  ocorrencias: PacoteOcorrencia[];
  danos: PacoteDano[];
};

export const CAUSAS_DANO: { value: PacoteDano["causa"]; label: string }[] = [
  { value: "fabricacao", label: "Fabricação" },
  { value: "transporte", label: "Transporte" },
  { value: "instalacao", label: "Instalação" },
  { value: "cliente", label: "Cliente" },
  { value: "indeterminada", label: "Indeterminada" },
];

export const STATUS_LABEL: Record<PacoteInstalacao["status"], string> = {
  agendada: "Agendada",
  em_execucao: "Em execução",
  concluida: "Concluída — aguardando aceite",
};
