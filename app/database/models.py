"""
SIPE | Sistema Ipê de Planejamento Estratégico - Modelos do Banco de Dados (SQLAlchemy)
Tabelas: Colaboradores, Vinculos, ProcessamentoRDO, LogAtividade, HistoricoTerceiro
"""
import json
from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Float, DateTime, Text, Boolean,
    ForeignKey, UniqueConstraint, create_engine, event
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

Base = declarative_base()


class Colaborador(Base):
    """
    Tabela permanente de colaboradores importados via Excel.
    Campos obrigatórios: nome.
    CPF é armazenado somente com dígitos (11 chars).
    categoria: 'MOD' (Mão de Obra Direta) ou 'MOI' (Mão de Obra Indireta).
    """
    __tablename__ = "colaboradores"

    id = Column(Integer, primary_key=True, autoincrement=True)
    nome = Column(String(255), nullable=False, index=True)
    cpf = Column(String(11), unique=True, nullable=True)        # Apenas dígitos (11 chars)
    matricula = Column(String(50), unique=True, nullable=True)  # Matrícula
    cargo = Column(String(150), nullable=True)
    setor = Column(String(150), nullable=True)
    categoria = Column(String(3), nullable=True)                 # 'MOD' ou 'MOI'
    empresa = Column(String(255), nullable=True)
    ativo = Column(Boolean, default=True)
    data_importacao = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    data_atualizacao = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                              onupdate=lambda: datetime.now(timezone.utc))

    # Relacionamentos
    vinculos = relationship("Vinculo", back_populates="colaborador", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Colaborador(id={self.id}, nome='{self.nome}', cpf='{self.cpf}')>"

    def to_dict(self):
        return {
            "id": self.id,
            "nome": self.nome,
            "cpf": self.cpf,
            "matricula": self.matricula,
            "cargo": self.cargo,
            "setor": self.setor,
            "categoria": self.categoria,
            "empresa": self.empresa,
            "ativo": self.ativo,
            "data_importacao": self.data_importacao.isoformat() if self.data_importacao else None,
            "data_atualizacao": self.data_atualizacao.isoformat() if self.data_atualizacao else None,
        }


class Vinculo(Base):
    """
    Histórico de aprendizado: vínculo entre nome 'sujo' extraído do PDF
    e o nome 'limpo' do colaborador na planilha.
    """
    __tablename__ = "vinculos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    nome_pdf = Column(String(255), nullable=False, index=True)   # Nome extraído do PDF
    colaborador_id = Column(Integer, ForeignKey("colaboradores.id"), nullable=False)
    score_similaridade = Column(Float, nullable=True)            # Score fuzzy (0-100)
    confirmado = Column(Boolean, default=False)                  # Confirmado pelo usuário
    data_criacao = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relacionamentos
    colaborador = relationship("Colaborador", back_populates="vinculos")

    __table_args__ = (
        UniqueConstraint("nome_pdf", "colaborador_id", name="uq_vinculo_nome_colab"),
    )

    def __repr__(self):
        return f"<Vinculo(nome_pdf='{self.nome_pdf}', colaborador_id={self.colaborador_id}, score={self.score_similaridade})>"

    def to_dict(self):
        return {
            "id": self.id,
            "nome_pdf": self.nome_pdf,
            "colaborador_id": self.colaborador_id,
            "colaborador_nome": self.colaborador.nome if self.colaborador else None,
            "score_similaridade": self.score_similaridade,
            "confirmado": self.confirmado,
            "data_criacao": self.data_criacao.isoformat() if self.data_criacao else None,
        }


class ProcessamentoRDO(Base):
    """Registro de cada processamento de PDF."""
    __tablename__ = "processamentos_rdo"

    id = Column(Integer, primary_key=True, autoincrement=True)
    nome_arquivo = Column(String(255), nullable=False)
    data_processamento = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    total_nomes_extraidos = Column(Integer, default=0)
    total_matches_auto = Column(Integer, default=0)
    total_matches_revisao = Column(Integer, default=0)
    total_sem_match = Column(Integer, default=0)
    status = Column(String(50), default="pendente")  # pendente, processando, concluido, erro
    resultado_json = Column(Text, nullable=True)      # JSON com resultado completo
    erro_mensagem = Column(Text, nullable=True)
    pdfs_json = Column(Text, nullable=True)       # JSON list of stored PDF filenames
    inicio_horario = Column(String(8), nullable=True)  # HH:MM menor início do dia
    fim_horario = Column(String(8), nullable=True)     # HH:MM maior fim do dia

    def __repr__(self):
        return f"<ProcessamentoRDO(id={self.id}, arquivo='{self.nome_arquivo}', status='{self.status}')>"

    def to_dict(self):
        return {
            "id": self.id,
            "nome_arquivo": self.nome_arquivo,
            "data_processamento": self.data_processamento.isoformat() if self.data_processamento else None,
            "total_nomes_extraidos": self.total_nomes_extraidos,
            "total_matches_auto": self.total_matches_auto,
            "total_matches_revisao": self.total_matches_revisao,
            "total_sem_match": self.total_sem_match,
            "status": self.status,
            "resultado_json": self.resultado_json,
            "pdfs_json": self.pdfs_json,
            "inicio_horario": self.inicio_horario,
            "fim_horario": self.fim_horario,
        }


class HistoricoTerceiro(Base):
    """Histórico de terceiros (prestadores, visitantes) que obtiveram acesso."""
    __tablename__ = "historico_terceiros"

    id = Column(Integer, primary_key=True, autoincrement=True)
    nome = Column(String(255), nullable=False, index=True)
    cpf = Column(String(11), nullable=True, index=True)
    placa = Column(String(20), nullable=True)
    empresa = Column(String(255), nullable=True)
    local = Column(String(255), nullable=True)
    motivo = Column(Text, nullable=True)
    data_cadastro = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "nome": self.nome,
            "cpf": self.cpf,
            "placa": self.placa,
            "empresa": self.empresa,
            "local": self.local,
            "motivo": self.motivo,
            "data_cadastro": self.data_cadastro.isoformat() if self.data_cadastro else None,
        }


class Projeto(Base):
    """Projeto de construção com cronograma de obras."""
    __tablename__ = "projetos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    nome = Column(String(255), nullable=False)
    descricao = Column(Text, nullable=True)
    status = Column(String(50), default='ativo')  # ativo, concluido, suspenso
    criado_em = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    tarefas = relationship("Tarefa", back_populates="projeto",
                           cascade="all, delete-orphan", order_by="Tarefa.ordem")

    def to_dict(self):
        return {
            "id": self.id, "nome": self.nome, "descricao": self.descricao,
            "status": self.status,
            "criado_em": self.criado_em.isoformat() if self.criado_em else None,
        }


class Tarefa(Base):
    """Tarefa/atividade do cronograma de obras."""
    __tablename__ = "tarefas"

    id = Column(Integer, primary_key=True, autoincrement=True)
    projeto_id = Column(Integer, ForeignKey("projetos.id"), nullable=False)
    codigo = Column(String(100), nullable=True)       # código WBS / ID
    nome = Column(String(500), nullable=False)
    nivel = Column(Integer, default=0)                # hierarquia (0=grupo, 1=sub, 2=atividade)
    ordem = Column(Integer, default=0)
    duracao = Column(Integer, nullable=True)          # dias
    inicio_previsto = Column(String(10), nullable=True)   # ISO YYYY-MM-DD
    fim_previsto = Column(String(10), nullable=True)
    inicio_real = Column(String(10), nullable=True)
    fim_real = Column(String(10), nullable=True)
    progresso = Column(Float, default=0.0)            # 0-100
    predecessoras = Column(Text, nullable=True)       # JSON list de códigos
    recursos_mo = Column(Integer, default=0)          # qtd mão de obra
    recursos_eq = Column(Integer, default=0)          # qtd equipamentos
    peso = Column(Float, default=1.0)                 # peso na Curva S
    is_marco = Column(Boolean, default=False)
    responsavel = Column(String(255), nullable=True)  # empresa/responsável pela tarefa

    projeto = relationship("Projeto", back_populates="tarefas")

    def to_dict(self):
        return {
            "id": self.id, "projeto_id": self.projeto_id,
            "codigo": self.codigo, "nome": self.nome,
            "nivel": self.nivel, "ordem": self.ordem, "duracao": self.duracao,
            "inicio_previsto": self.inicio_previsto, "fim_previsto": self.fim_previsto,
            "inicio_real": self.inicio_real, "fim_real": self.fim_real,
            "progresso": self.progresso or 0.0,
            "predecessoras": json.loads(self.predecessoras) if self.predecessoras else [],
            "recursos_mo": self.recursos_mo or 0,
            "recursos_eq": self.recursos_eq or 0,
            "peso": self.peso or 1.0,
            "is_marco": self.is_marco or False,
            "responsavel": self.responsavel,
        }


class Equipamento(Base):
    """Equipamentos e máquinas cadastrados."""
    __tablename__ = "equipamentos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    nome = Column(String(255), nullable=False)
    codigo = Column(String(100), nullable=True)   # código interno ou placa
    status = Column(String(50), default='ativo')  # ativo, inativo, manutencao
    criado_em = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {"id": self.id, "nome": self.nome, "codigo": self.codigo,
                "status": self.status,
                "criado_em": self.criado_em.isoformat() if self.criado_em else None}


class Veiculo(Base):
    """Veículos cadastrados (frota própria e terceiros)."""
    __tablename__ = "veiculos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    placa = Column(String(20), nullable=False)
    modelo = Column(String(150), nullable=True)
    empresa = Column(String(255), nullable=True)
    criado_em = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {"id": self.id, "placa": self.placa, "modelo": self.modelo,
                "empresa": self.empresa,
                "criado_em": self.criado_em.isoformat() if self.criado_em else None}


class PermissaoTrabalho(Base):
    """Permissão de Trabalho (PT) extraída dos PDFs PTe/Cesla."""
    __tablename__ = "permissoes_trabalho"

    id = Column(Integer, primary_key=True, autoincrement=True)
    processamento_id = Column(Integer, ForeignKey("processamentos_rdo.id"), nullable=True)
    numero_pt = Column(String(50), nullable=False)
    descricao = Column(Text, nullable=True)
    data_documento = Column(String(10), nullable=True)  # YYYY-MM-DD
    criado_em = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "processamento_id": self.processamento_id,
            "numero_pt": self.numero_pt,
            "descricao": self.descricao,
            "data_documento": self.data_documento,
            "criado_em": self.criado_em.isoformat() if self.criado_em else None,
        }


class LogAtividade(Base):
    """Log de atividades do sistema."""
    __tablename__ = "log_atividades"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tipo = Column(String(50), nullable=False)        # info, warning, error, success
    modulo = Column(String(100), nullable=False)      # efetivo, rdo, clima, sistema
    mensagem = Column(Text, nullable=False)
    detalhes = Column(Text, nullable=True)
    data = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "tipo": self.tipo,
            "modulo": self.modulo,
            "mensagem": self.mensagem,
            "data": self.data.isoformat() if self.data else None,
        }


class HistoricoLiberacao(Base):
    """Histórico de textos de liberação de acesso gerados."""
    __tablename__ = "historico_liberacoes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    motorista = Column(String(255), nullable=False)
    cpf = Column(String(11), nullable=True)
    empresa = Column(String(255), nullable=True)
    placa = Column(String(20), nullable=True)
    local = Column(String(255), nullable=True)
    motivo = Column(Text, nullable=True)
    periodo = Column(String(50), nullable=True)       # "Manhã", "Tarde", "Manhã e Tarde"
    data_acesso = Column(String(10), nullable=True)    # YYYY-MM-DD
    gerado_por = Column(String(255), nullable=True)    # quem gerou
    texto_gerado = Column(Text, nullable=False)
    data_geracao = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "motorista": self.motorista,
            "cpf": self.cpf,
            "empresa": self.empresa,
            "placa": self.placa,
            "local": self.local,
            "motivo": self.motivo,
            "periodo": self.periodo,
            "data_acesso": self.data_acesso,
            "gerado_por": self.gerado_por,
            "texto_gerado": self.texto_gerado,
            "data_geracao": self.data_geracao.isoformat() if self.data_geracao else None,
        }
