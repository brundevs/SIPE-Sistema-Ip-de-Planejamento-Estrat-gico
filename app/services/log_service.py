"""
SIPE | Sistema Ipê de Planejamento Estratégico - Serviço de Log
Registra atividades do sistema no banco de dados.
"""
from datetime import datetime, timezone
from app.database.models import LogAtividade


def registrar_log(db_session, tipo: str, modulo: str, mensagem: str, detalhes: str = None):
    """
    Registra uma atividade no log do sistema.
    
    Args:
        db_session: Sessão do banco de dados
        tipo: info, warning, error, success
        modulo: efetivo, rdo, clima, sistema
        mensagem: Descrição da atividade
        detalhes: Detalhes adicionais (opcional)
    """
    log = LogAtividade(
        tipo=tipo,
        modulo=modulo,
        mensagem=mensagem,
        detalhes=detalhes,
        data=datetime.now(timezone.utc)
    )
    db_session.add(log)
    db_session.commit()
    return log


def obter_logs_recentes(db_session, limite: int = 50, modulo: str = None):
    """Retorna os logs mais recentes."""
    query = db_session.query(LogAtividade).order_by(LogAtividade.data.desc())
    if modulo:
        query = query.filter(LogAtividade.modulo == modulo)
    return query.limit(limite).all()
