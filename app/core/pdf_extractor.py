"""
RDO Pro Max 2.0 - Motor de Extração de PDF
Extrai nomes, CPFs e dados de RDOs usando pdfplumber.
"""
import re
import pdfplumber
from pathlib import Path
from typing import List, Dict, Optional


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
