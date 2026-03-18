"""
RDO Pro Max 2.0 - Gerenciador de Sessão do Banco de Dados
"""
import sys
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session

# Adicionar root ao path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
from config import SQLALCHEMY_DATABASE_URL

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},  # SQLite thread safety
    echo=False,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
ScopedSession = scoped_session(SessionLocal)


def get_db():
    """Generator para obter sessão do banco. Usar com context manager ou dependency injection."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Cria todas as tabelas no banco de dados."""
    from app.database.models import Base
    Base.metadata.create_all(bind=engine)
    print("[OK] Banco de dados inicializado com sucesso!")
