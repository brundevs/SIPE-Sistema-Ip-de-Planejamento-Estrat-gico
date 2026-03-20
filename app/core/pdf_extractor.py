"""
SIPE | Sistema Ipê de Planejamento Estratégico - Motor de Extração de PDF
Extrai nomes, CPFs e dados de RDOs usando pdfplumber.
"""
import re
import pdfplumber
from pathlib import Path
from typing import List, Dict, Optional, Tuple


def extrair_texto_pdf(caminho_pdf: str) -> str:
    """Extrai todo o texto de um arquivo PDF."""
    texto_completo = []
    caminho = Path(caminho_pdf)

    if not caminho.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {caminho_pdf}")

    if caminho.suffix.lower() != ".pdf":
        raise ValueError(f"Arquivo não é PDF: {caminho_pdf}")

    with pdfplumber.open(str(caminho)) as pdf:
        for pagina in pdf.pages:
            texto = pagina.extract_text()
            if texto:
                texto_completo.append(texto)

    return "\n".join(texto_completo)


def extrair_tabelas_pdf(caminho_pdf: str) -> List[List[List[str]]]:
    """Extrai todas as tabelas de um PDF."""
    tabelas = []
    with pdfplumber.open(str(caminho_pdf)) as pdf:
        for pagina in pdf.pages:
            tabelas_pagina = pagina.extract_tables()
            if tabelas_pagina:
                tabelas.extend(tabelas_pagina)
    return tabelas


def limpar_nome(nome: str) -> str:
    """Limpa e normaliza um nome extraído do PDF."""
    if not nome:
        return ""

    # Remove caracteres especiais, mantém letras, espaços e acentos
    nome = re.sub(r'[^\w\s\u00C0-\u024F]', ' ', nome)
    # Remove múltiplos espaços
    nome = re.sub(r'\s+', ' ', nome).strip()
    # Título case
    nome = nome.title()
    return nome


def extrair_cpfs(texto: str) -> List[str]:
    """Extrai todos os CPFs encontrados no texto."""
    # Padrão: 000.000.000-00 ou 00000000000
    padrao_formatado = r'\d{3}\.\d{3}\.\d{3}-\d{2}'
    padrao_numerico = r'(?<!\d)\d{11}(?!\d)'

    cpfs = re.findall(padrao_formatado, texto)
    cpfs_numericos = re.findall(padrao_numerico, texto)

    # Formatar CPFs numéricos
    for cpf in cpfs_numericos:
        formatado = f"{cpf[:3]}.{cpf[3:6]}.{cpf[6:9]}-{cpf[9:]}"
        if formatado not in cpfs:
            cpfs.append(formatado)

    return [cpf for cpf in cpfs if validar_cpf(cpf)]


def validar_cpf(cpf: str) -> bool:
    """Valida um CPF usando dígitos verificadores."""
    numeros = re.sub(r'[^\d]', '', cpf)

    if len(numeros) != 11:
        return False

    # CPFs com todos os dígitos iguais são inválidos
    if numeros == numeros[0] * 11:
        return False

    # Validação do primeiro dígito
    soma = sum(int(numeros[i]) * (10 - i) for i in range(9))
    resto = (soma * 10) % 11
    if resto == 10:
        resto = 0
    if resto != int(numeros[9]):
        return False

    # Validação do segundo dígito
    soma = sum(int(numeros[i]) * (11 - i) for i in range(10))
    resto = (soma * 10) % 11
    if resto == 10:
        resto = 0
    if resto != int(numeros[10]):
        return False

    return True


def extrair_matriculas(texto: str) -> List[str]:
    """Extrai matrículas do texto (padrões comuns)."""
    # Matrícula de 4-8 dígitos, possivelmente com prefixo
    padrao = r'(?:MAT|MATR[ÍI]CULA|REG)[\s.:]*(\d{4,8})'
    matriculas = re.findall(padrao, texto, re.IGNORECASE)

    return list(set(matriculas))


def extrair_nomes_do_rdo(texto: str) -> List[Dict[str, str]]:
    """
    Extrai nomes e informações associadas do texto do RDO.
    Retorna lista de dicts com nome, cpf, matricula (quando disponíveis).
    """
    resultados = []
    linhas = texto.split('\n')

    # Padrão para linhas com nomes (heurística: 2+ palavras com primeira maiúscula)
    padrao_nome = re.compile(
        r'(?:^|\s)([A-ZÀ-Ú][a-zà-ú]+(?:\s+(?:de|da|do|dos|das|e)?\s*[A-ZÀ-Ú][a-zà-ú]+){1,6})'
    )

    # Padrão para nomes em MAIÚSCULAS (comum em RDOs)
    padrao_nome_upper = re.compile(
        r'(?:^|\s)([A-ZÀ-Ú]{2,}(?:\s+(?:DE|DA|DO|DOS|DAS|E)?\s*[A-ZÀ-Ú]{2,}){1,6})'
    )

    nomes_encontrados = set()

    for linha in linhas:
        linha = linha.strip()
        if not linha or len(linha) < 5:
            continue

        # Buscar nomes em Title Case
        matches = padrao_nome.findall(linha)
        for match in matches:
            nome_limpo = limpar_nome(match)
            if nome_limpo and len(nome_limpo) > 4 and nome_limpo not in nomes_encontrados:
                nomes_encontrados.add(nome_limpo)
                resultados.append({
                    "nome_original": match.strip(),
                    "nome_limpo": nome_limpo,
                    "linha_origem": linha[:100],
                })

        # Buscar nomes em MAIÚSCULAS
        matches_upper = padrao_nome_upper.findall(linha)
        for match in matches_upper:
            nome_limpo = limpar_nome(match)
            if nome_limpo and len(nome_limpo) > 4 and nome_limpo not in nomes_encontrados:
                nomes_encontrados.add(nome_limpo)
                resultados.append({
                    "nome_original": match.strip(),
                    "nome_limpo": nome_limpo,
                    "linha_origem": linha[:100],
                })

    return resultados


# ──────────────────────────────────────────────────────────────
# EXTRAÇÃO PTE / CESLA  (Planilha de Trabalho de Equipe)
# ──────────────────────────────────────────────────────────────

def _normalizar_cpf(raw: str) -> str:
    """Formata string numérica de 11 dígitos como CPF."""
    d = re.sub(r'\D', '', raw)
    if len(d) == 11:
        return f"{d[:3]}.{d[3:6]}.{d[6:9]}-{d[9:]}"
    return raw.strip()


def extrair_data_documento(texto: str) -> str:
    """
    Tenta extrair a data de referência do documento PTE/Cesla.
    Retorna string 'DD/MM/YYYY' ou 'Sem Data'.
    """
    padroes = [
        # DATA: 15/07/2025 ou Data: 15-07-2025
        r'(?:data|date|dt)[:\s.]*(\d{1,2}[/\-]\d{1,2}[/\-]\d{4})',
        # DIA 15/07/2025
        r'(?:dia|day)[:\s.]*(\d{1,2}[/\-]\d{1,2}[/\-]\d{4})',
        # Standalone DD/MM/YYYY (primeiras ocorrências)
        r'\b(\d{1,2}/\d{1,2}/\d{4})\b',
        r'\b(\d{1,2}-\d{1,2}-\d{4})\b',
    ]

    for padrao in padroes:
        m = re.search(padrao, texto[:3000], re.IGNORECASE)
        if m:
            data_raw = m.group(1).replace('-', '/')
            partes = data_raw.split('/')
            if len(partes) == 3:
                dia, mes, ano = partes
                try:
                    from datetime import date
                    date(int(ano), int(mes), int(dia))
                    return f"{int(dia):02d}/{int(mes):02d}/{ano}"
                except ValueError:
                    continue

    return "Sem Data"


def extrair_horarios_pte(texto: str) -> Tuple[str, str]:
    """Extrai 'Data/Hora efetiva inicio' e 'fim' do texto do documento PTE/Cesla.

    Formato esperado (data na linha seguinte ao label):
        Data/Hora efetiva inicio
        19/03/2026 8:11:34
        Data/Hora efetiva fim
        19/03/2026 16:35:27
    """
    inicio = ""
    fim = ""
    _dt_pat = r'(\d{1,2}[/\-]\d{1,2}[/\-]\d{4}\s+\d{1,2}:\d{2}:\d{2})'

    # Tenta match direto: label + newline(s) + datetime
    m_ini = re.search(r'Data/Hora efetiva in[ií]cio\s*\n\s*' + _dt_pat, texto, re.IGNORECASE)
    if m_ini:
        inicio = m_ini.group(1).strip()
    else:
        # fallback: label com qualquer whitespace antes da data
        m_ini = re.search(r'Data/Hora efetiva in[ií]cio[\s\S]{0,60}?' + _dt_pat, texto, re.IGNORECASE)
        if m_ini:
            inicio = m_ini.group(1).strip()

    m_fim = re.search(r'Data/Hora efetiva fim\s*\n\s*' + _dt_pat, texto, re.IGNORECASE)
    if m_fim:
        fim = m_fim.group(1).strip()
    else:
        m_fim = re.search(r'Data/Hora efetiva fim[\s\S]{0,60}?' + _dt_pat, texto, re.IGNORECASE)
        if m_fim:
            fim = m_fim.group(1).strip()

    return inicio, fim


def extrair_colaboradores_pte(texto: str) -> List[Dict[str, str]]:
    """
    Extrai colaboradores MOD (mão de obra direta) de texto bruto de PDF PTE/Cesla.

    Estratégias aplicadas (em ordem decrescente de confiança):
      1. Linha tabular: Nome + CPF formatado na mesma linha
      2. Linha tabular: Nome + 11 dígitos consecutivos (CPF sem formatação)
      3. Generalized: todas as linhas com CPF formatado
      4. Fallback: nomes em MAIÚSCULAS em lista numerada (ex: "1. JOÃO SILVA")
    """
    colaboradores: List[Dict[str, str]] = []
    vistos: set = set()  # evitar duplicatas

    linhas = texto.split('\n')

    # ── Regex helpers ────────────────────────────────────────
    re_cpf_fmt    = re.compile(r'\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b')
    re_cpf_raw    = re.compile(r'(?<!\d)(\d{11})(?!\d)')
    re_matricula  = re.compile(r'\b(\d{4,8})\b')
    re_nome_upper = re.compile(
        r'\b([A-ZÁÉÍÓÚÀÃÕÂÊÔÇ]{2,}(?:\s+(?:DE|DA|DO|DOS|DAS|E)?\s*[A-ZÁÉÍÓÚÀÃÕÂÊÔÇ]{2,}){1,6})\b'
    )
    re_nome_title = re.compile(
        r'\b([A-ZÁÉÍÓÚÀÃÕÂÊÔÇ][a-záéíóúàãõâêôç]+(?:\s+(?:de|da|do|dos|das|e)?\s*[A-ZÁÉÍÓÚÀÃÕÂÊÔÇ][a-záéíóúàãõâêôç]+){1,6})\b'
    )

    # Palavras que não são nomes de pessoas
    STOP_WORDS = {
        # Cabeçalhos de tabela
        'MOD', 'MOI', 'RDO', 'CPF', 'DATA', 'NOME', 'CARGO', 'SETOR',
        'TOTAL', 'COLABORADOR', 'COLABORADORES', 'ASSINATURA', 'OBS',
        'OBSERVAÇÃO', 'OBSERVACOES', 'FUNÇÃO', 'MATRICULA', 'MATRÍCULA',
        'PLANILHA', 'EQUIPE', 'RESPONSÁVEL', 'RESPONSAVEL',
        'REFERÊNCIA', 'REFERENCIA', 'EMPRESA', 'OBRA', 'LOCAL',
        # Verbos de ação (indicam atividade/tarefa, não nome de pessoa)
        'EXECUTAR', 'REALIZAR', 'INSTALAR', 'MONTAR', 'REMOVER', 'RETIRAR',
        'EFETUAR', 'OPERAR', 'SOLDAR', 'CORTAR', 'FAZER', 'COLOCAR',
        'IÇAMENTO', 'IÇAR', 'ISOLAR', 'SINALIZAR', 'INSPECIONAR',
        'DOCUMENTOS', 'DOCUMENTO', 'MEDIDAS', 'MEDIDA', 'CONTROLE',
        'ATIVIDADES', 'ATIVIDADE', 'PRIMÁRIAS', 'SECUNDÁRIAS',
        'ABANDONO', 'MUDANÇA', 'CONDIÇÕES', 'ÁREA', 'AUXÍLIO',
        'ENCERRAMENTO', 'ABERTURA', 'ESTACA', 'GUINDASTE', 'CAMINHÃO',
        'PREVISTOS', 'PREVISTAS', 'APROVADAS', 'ISOLADOS', 'SINALIZADAS',
        'SIMILAR', 'ALGO', 'NENHUMA', 'SALA', 'SAIAM',
    }

    # Conjunções que indicam frase de atividade (não aparecem em nomes)
    CONJUNCOES_ATIVIDADE = {'OU', 'E', 'COM', 'NAS', 'NOS', 'NAS', 'DAS', 'DOS'}

    def _nome_valido(nome: str) -> bool:
        if not nome or len(nome) < 5:
            return False
        partes = nome.split()
        # Nomes de pessoas têm no máximo 6 palavras (em geral 2-4)
        if len(partes) < 2 or len(partes) > 5:
            return False
        # Se qualquer parte for stop-word de atividade → rejeitar
        if any(p.upper() in STOP_WORDS for p in partes):
            return False
        # Se contiver dígito → rejeitar
        if re.search(r'\d', nome):
            return False
        # Conjunções no MEIO do nome indicam frase de atividade (ex: "Fulano Ou Silva")
        palavras_meio = partes[1:-1]  # exclui primeira e última
        if any(p.upper() in CONJUNCOES_ATIVIDADE for p in palavras_meio):
            return False
        # Nomes têm pelo menos uma palavra com 4+ letras (evita abreviações soltas)
        if not any(len(p) >= 4 for p in partes):
            return False
        return True

    def _adicionar(nome: str, cpf: str = '', matricula: str = '', cargo: str = ''):
        nome = limpar_nome(nome)
        if not _nome_valido(nome):
            return
        chave = nome.lower()
        if chave in vistos:
            return
        vistos.add(chave)
        colaboradores.append({
            'nome': nome,
            'cpf': _normalizar_cpf(cpf) if cpf else '',
            'matricula': matricula.strip() if matricula else '',
            'cargo': cargo.strip() if cargo else '',
        })

    # ── Estratégia 1 & 2: linhas com CPF ────────────────────
    for linha in linhas:
        linha_strip = linha.strip()
        if not linha_strip or len(linha_strip) < 8:
            continue

        cpf_match = re_cpf_fmt.search(linha_strip)
        if not cpf_match:
            # Tenta CPF sem formatação
            cpf_raw = re_cpf_raw.search(linha_strip)
            if cpf_raw and validar_cpf(cpf_raw.group(1)):
                cpf_match_str = cpf_raw.group(1)
                linha_sem_cpf = linha_strip.replace(cpf_match_str, ' ')
            else:
                continue
        else:
            cpf_match_str = cpf_match.group(1)
            linha_sem_cpf = linha_strip.replace(cpf_match_str, ' ')

        # Extrair nome da linha sem CPF
        nome_found = ''
        for m in re_nome_upper.finditer(linha_sem_cpf):
            cand = m.group(1)
            if _nome_valido(cand) and len(cand) > len(nome_found):
                nome_found = cand
        if not nome_found:
            for m in re_nome_title.finditer(linha_sem_cpf):
                cand = m.group(1)
                if _nome_valido(cand) and len(cand) > len(nome_found):
                    nome_found = cand

        if nome_found:
            # Tentar matrícula: número de 4-8 dígitos na linha, diferente do CPF
            mat = ''
            for m in re_matricula.finditer(linha_sem_cpf):
                val = m.group(1)
                if val not in cpf_match_str and 4 <= len(val) <= 8:
                    mat = val
                    break

            _adicionar(nome_found, cpf_match_str, mat)

    # ── Estratégia 3: fallback por lista numerada ────────────
    re_lista = re.compile(
        r'^\s*\d+[\.\)]\s*'         # número inicial: "1. " ou "1) "
        r'([A-ZÁÉÍÓÚÀÃÕÂÊÔÇ]{2,}'  # começa com maiúsculas
        r'(?:\s+[A-ZÁÉÍÓÚÀÃÕÂÊÔÇ]{2,}){1,6})'
    )

    for linha in linhas:
        m = re_lista.match(linha)
        if m:
            _adicionar(m.group(1))

    # ── Estratégia 4: qualquer linha só com nome em maiúsculas ──
    if len(colaboradores) == 0:
        for linha in linhas:
            linha_strip = linha.strip()
            if not linha_strip:
                continue
            # Linha onde 80%+ são letras maiúsculas
            letras = re.sub(r'\s', '', linha_strip)
            if not letras or len(letras) < 6:
                continue
            maiusculas = sum(1 for c in letras if c.isupper())
            if (maiusculas / len(letras)) > 0.75:
                for m in re_nome_upper.finditer(linha_strip):
                    _adicionar(m.group(1))

    return colaboradores


def extrair_permissoes_trabalho(texto: str) -> List[Dict[str, str]]:
    """
    Extrai IDs e descrições de Permissões de Trabalho de um texto PTE/Cesla.
    Retorna lista de dicts: [{"numero_pt": "190026", "descricao": "..."}]
    """
    resultado: List[Dict[str, str]] = []

    # ── Padrões para ID da PT ──────────────────────────────────
    id_patterns = [
        re.compile(r'ID\s+da\s+Atividade\s*[\n\r:]+\s*(\d{5,9})', re.IGNORECASE),
        re.compile(r'N[uú]mero\s+da\s+(?:PT|Permiss[aã]o)\s*[\n\r:]+\s*(\d{5,9})', re.IGNORECASE),
        re.compile(r'PT\s*[:\-]\s*(\d{5,9})\b', re.IGNORECASE),
        re.compile(r'\bPT\s+N[º°o]?\s*(\d{5,9})\b', re.IGNORECASE),
    ]

    ids: List[str] = []
    for pat in id_patterns:
        for m in pat.finditer(texto):
            cand = m.group(1)
            if cand not in ids:
                ids.append(cand)

    # ── Padrões para descrição da atividade ───────────────────
    desc_patterns = [
        re.compile(
            r'Descri[cç][aã]o\s+detalhada\s+da\s+atividade\s*[\n\r:]+\s*(.+?)(?=\n{3,}|Responsável|Assinatura|Aprovad|Executor|$)',
            re.IGNORECASE | re.DOTALL
        ),
        re.compile(
            r'Descri[cç][aã]o\s+da\s+atividade\s*[\n\r:]+\s*(.+?)(?=\n{3,}|Responsável|Assinatura|$)',
            re.IGNORECASE | re.DOTALL
        ),
    ]

    descricoes: List[str] = []
    for pat in desc_patterns:
        for m in pat.finditer(texto):
            desc = re.sub(r'\s+', ' ', m.group(1)).strip()
            if desc and len(desc) > 10:
                descricoes.append(desc[:3000])
        if descricoes:
            break

    # ── Montar resultado ──────────────────────────────────────
    if ids:
        for i, pt_id in enumerate(ids):
            resultado.append({
                "numero_pt": pt_id,
                "descricao": descricoes[i] if i < len(descricoes) else (descricoes[0] if descricoes else ""),
            })
    elif descricoes:
        # Tem descrição mas não achou ID explícito
        resultado.append({"numero_pt": "", "descricao": descricoes[0]})

    return resultado


def extrair_dados_pte_obra(texto: str) -> Dict:
    """
    Extrai campos específicos de um PDF de Permissão de Trabalho (PTe) Nestlé
    para o módulo Planejamento de Obras > Histórico PTe.

    Retorna dict com:
      - id_atividade  : str
      - id_pte        : str
      - hora_inicio   : str  (DD/MM/YYYY HH:MM:SS)
      - hora_fim      : str  (DD/MM/YYYY HH:MM:SS)
      - descricao     : str  (entre "Descrição detalhada da atividade" e "ID- Modelo das PTe's")
    """
    result = {
        "id_atividade": "",
        "id_pte": "",
        "hora_inicio": "",
        "hora_fim": "",
        "descricao": "",
    }

    # ── ID da Atividade ──────────────────────────────────────────────────────
    # Aparece após label "ID da Atividade" (com ou sem ":")
    m = re.search(r'ID\s+da\s+Atividade\s*[:\-]?\s*([A-Z0-9\-]+)', texto, re.IGNORECASE)
    if m:
        result["id_atividade"] = m.group(1).strip()

    # ── ID da PTe ────────────────────────────────────────────────────────────
    # Aparece no bloco "ID da APR  ID da PTe\n<val1>  <val2>"
    m_block = re.search(
        r'ID\s+da\s+APR\s+ID\s+da\s+PTe[\s\S]{0,80}?(\d{5,})',
        texto, re.IGNORECASE
    )
    if m_block:
        result["id_pte"] = m_block.group(1).strip()
    else:
        # fallback: procura "ID da PTe" seguido de valor
        m2 = re.search(r'ID\s+da\s+PTe\s*[:\-]?\s*([A-Z0-9\-]+)', texto, re.IGNORECASE)
        if m2:
            result["id_pte"] = m2.group(1).strip()

    # ── Data/Hora efetiva início ──────────────────────────────────────────────
    _dt_pat = r'(\d{1,2}[/\-]\d{1,2}[/\-]\d{4}\s+\d{1,2}:\d{2}:\d{2})'
    m_ini = re.search(r'Data/Hora efetiva in[ií]cio\s*\n\s*' + _dt_pat, texto, re.IGNORECASE)
    if not m_ini:
        m_ini = re.search(r'Data/Hora efetiva in[ií]cio[\s\S]{0,60}?' + _dt_pat, texto, re.IGNORECASE)
    if m_ini:
        result["hora_inicio"] = m_ini.group(1).strip()

    # ── Data/Hora efetiva fim ────────────────────────────────────────────────
    m_fim = re.search(r'Data/Hora efetiva fim\s*\n\s*' + _dt_pat, texto, re.IGNORECASE)
    if not m_fim:
        m_fim = re.search(r'Data/Hora efetiva fim[\s\S]{0,60}?' + _dt_pat, texto, re.IGNORECASE)
    if m_fim:
        result["hora_fim"] = m_fim.group(1).strip()

    # ── Descrição Detalhada ──────────────────────────────────────────────────
    m_desc = re.search(
        r'Descri[çc][aã]o\s+detalhada\s+da\s+atividade\s*([\s\S]+?)(?:ID[-\s]*Modelo\s+das\s+PTe|$)',
        texto, re.IGNORECASE
    )
    if m_desc:
        desc_raw = m_desc.group(1).strip()
        # Remove linhas que parecem cabeçalho/rodapé (muito curtas ou só números)
        linhas = [l.strip() for l in desc_raw.splitlines() if len(l.strip()) > 3]
        result["descricao"] = " ".join(linhas[:10])  # limita a 10 linhas

    return result
