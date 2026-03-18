"""
RDO Pro Max 2.0 - Modelos do Banco de Dados (SQLAlchemy)
Tabelas: Colaboradores, Vinculos, ProcessamentoRDO, LogAtividade
"""
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
