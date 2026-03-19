"""
SIPE | Sistema Ipê de Planejamento Estratégico - Gerenciador de Sessão do Banco de Dados
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
    """Cria todas as tabelas e aplica migrações de colunas faltantes."""
    from app.database.models import Base
    import sqlalchemy as sa

    # 1. Criar tabelas que ainda não existem
    Base.metadata.create_all(bind=engine, checkfirst=True)

    # 2. Migração automática: adicionar colunas faltantes em tabelas existentes
    #    (SQLite não suporta DROP/ALTER COLUMN, mas suporta ADD COLUMN)
    _migrate_missing_columns()

    print("[OK] Banco de dados inicializado com sucesso!")


def _migrate_missing_columns():
    """
    Compara o schema do modelo com o banco e executa ALTER TABLE ADD COLUMN
    para qualquer coluna presente no modelo mas ausente no banco.
    Seguro para SQLite — não apaga dados existentes.
    """
    from app.database.models import Base
    import sqlalchemy as sa

    with engine.connect() as conn:
        for table in Base.metadata.sorted_tables:
            # Obtém colunas atuais no banco
            try:
                result = conn.execute(sa.text(f"PRAGMA table_info({table.name})"))
                existing_cols = {row[1].lower() for row in result.fetchall()}
            except Exception:
                continue  # Tabela ainda não existe → create_all cuida disso

            # Compara com colunas definidas no modelo
            for col in table.columns:
                if col.name.lower() not in existing_cols:
                    # Monta definição mínima da coluna para o ALTER TABLE
                    col_type = col.type.compile(dialect=engine.dialect)
                    nullable = "" if col.nullable else " NOT NULL"
                    default_clause = ""
                    if col.default is not None and col.default.is_scalar:
                        val = col.default.arg
                        if isinstance(val, str):
                            default_clause = f" DEFAULT '{val}'"
                        elif isinstance(val, bool):
                            default_clause = f" DEFAULT {int(val)}"
                        elif val is not None:
                            default_clause = f" DEFAULT {val}"
                    elif col.nullable:
                        default_clause = " DEFAULT NULL"

                    sql = (
                        f"ALTER TABLE {table.name} "
                        f"ADD COLUMN {col.name} {col_type}{default_clause}"
                    )
                    try:
                        conn.execute(sa.text(sql))
                        conn.commit()
                        print(f"  [MIGRATE] {table.name}.{col.name} adicionado.")
                    except Exception as e:
                        print(f"  [MIGRATE] AVISO ao adicionar {table.name}.{col.name}: {e}")

