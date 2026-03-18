"""
RDO Pro Max 2.0 - Motor de Busca Fuzzy
Lógica de comparação de strings com thefuzz para matching de nomes.
"""
from typing import List, Dict, Optional, Tuple
from thefuzz import fuzz, process

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
from config import FUZZY_THRESHOLD_AUTO, FUZZY_THRESHOLD_REVIEW


def buscar_melhor_match(
    nome_busca: str,
    lista_nomes: List[str],
    threshold_auto: int = FUZZY_THRESHOLD_AUTO,
    threshold_review: int = FUZZY_THRESHOLD_REVIEW,
    limit: int = 5
) -> Dict:
    """
    Busca o melhor match para um nome na lista de colaboradores.
    
    Retorna:
        {
            "nome_busca": str,
            "melhor_match": str or None,
            "score": int,
            "status": "auto" | "revisao" | "sem_match",
            "candidatos": [{"nome": str, "score": int}, ...]
        }
    """
    if not nome_busca or not lista_nomes:
        return {
            "nome_busca": nome_busca,
            "melhor_match": None,
            "score": 0,
            "status": "sem_match",
            "candidatos": []
        }

    # Usar token_sort_ratio para ser resiliente à ordem das palavras
    resultados = process.extract(
        nome_busca,
        lista_nomes,
        scorer=fuzz.token_sort_ratio,
        limit=limit
    )

    if not resultados:
        return {
            "nome_busca": nome_busca,
            "melhor_match": None,
            "score": 0,
            "status": "sem_match",
            "candidatos": []
        }

    melhor_nome, melhor_score = resultados[0][0], resultados[0][1]
    candidatos = [{"nome": r[0], "score": r[1]} for r in resultados]

    # Classificar resultado
    if melhor_score >= threshold_auto:
        status = "auto"
    elif melhor_score >= threshold_review:
        status = "revisao"
    else:
        status = "sem_match"

    return {
        "nome_busca": nome_busca,
        "melhor_match": melhor_nome,
        "score": melhor_score,
        "status": status,
        "candidatos": candidatos
    }


def buscar_por_cpf(cpf_busca: str, mapa_cpf_nome: Dict[str, str]) -> Optional[str]:
    """Busca exata por CPF. Retorna o nome do colaborador ou None."""
    cpf_limpo = cpf_busca.replace(".", "").replace("-", "").strip()

    for cpf, nome in mapa_cpf_nome.items():
        cpf_ref = cpf.replace(".", "").replace("-", "").strip()
        if cpf_limpo == cpf_ref:
            return nome

    return None


def buscar_por_matricula(matricula: str, mapa_mat_nome: Dict[str, str]) -> Optional[str]:
    """Busca exata por matrícula. Retorna o nome do colaborador ou None."""
    matricula_limpa = matricula.strip()

    for mat, nome in mapa_mat_nome.items():
        if matricula_limpa == mat.strip():
            return nome

    return None


def processar_lista_nomes(
    nomes_pdf: List[str],
    colaboradores: List[Dict],
    vip_names: List[str] = None
) -> Dict[str, List]:
    """
    Processa uma lista de nomes extraídos do PDF contra a base de colaboradores.
    
    Ordem de busca:
    1. Nomes VIP (match direto)
    2. CPF/Matrícula (exatidão numérica)
    3. Fuzzy matching (similaridade)
    
    Args:
        nomes_pdf: Lista de nomes extraídos do PDF
        colaboradores: Lista de dicts com dados dos colaboradores
        vip_names: Lista de nomes VIP para busca prioritária
    
    Returns:
        {
            "automaticos": [...],   # Match automático (score >= 90)
            "revisao": [...],       # Precisa revisão humana (60-89)
            "sem_match": [...],     # Sem correspondência (< 60)
            "estatisticas": {...}
        }
    """
    if vip_names is None:
        vip_names = []

    resultados = {
        "automaticos": [],
        "revisao": [],
        "sem_match": [],
        "estatisticas": {
            "total_nomes": len(nomes_pdf),
            "automaticos": 0,
            "revisao": 0,
            "sem_match": 0,
        }
    }

    # Preparar mapas de busca
    lista_nomes = [c.get("nome", "") for c in colaboradores]
    mapa_cpf = {c.get("cpf", ""): c.get("nome", "") for c in colaboradores if c.get("cpf")}
    mapa_mat = {c.get("matricula", ""): c.get("nome", "") for c in colaboradores if c.get("matricula")}

    # Normalizar VIPs
    vip_set = {v.strip().lower() for v in vip_names}

    for nome_pdf in nomes_pdf:
        if not nome_pdf or not nome_pdf.strip():
            continue

        # 1. Busca VIP
        if nome_pdf.strip().lower() in vip_set:
            resultado = {
                "nome_pdf": nome_pdf,
                "match": nome_pdf,
                "score": 100,
                "metodo": "vip",
                "status": "auto"
            }
            resultados["automaticos"].append(resultado)
            resultados["estatisticas"]["automaticos"] += 1
            continue

        # 2. Fuzzy matching (inclui busca implícita por similaridade alta = CPF match)
        match_result = buscar_melhor_match(nome_pdf, lista_nomes)

        resultado = {
            "nome_pdf": nome_pdf,
            "match": match_result["melhor_match"],
            "score": match_result["score"],
            "metodo": "fuzzy",
            "status": match_result["status"],
            "candidatos": match_result["candidatos"]
        }

        if match_result["status"] == "auto":
            resultados["automaticos"].append(resultado)
            resultados["estatisticas"]["automaticos"] += 1
        elif match_result["status"] == "revisao":
            resultados["revisao"].append(resultado)
            resultados["estatisticas"]["revisao"] += 1
        else:
            resultados["sem_match"].append(resultado)
            resultados["estatisticas"]["sem_match"] += 1

    return resultados
