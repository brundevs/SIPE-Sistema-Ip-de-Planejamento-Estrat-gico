"""
RDO Pro Max 2.0 - Rotas da API Web (Flask)
Endpoints para Efetivo, RDO e Clima.
"""
import json
import os
from pathlib import Path
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, current_app
from sqlalchemy import func
from werkzeug.utils import secure_filename
import openpyxl

from app.database.models import Colaborador, Vinculo, ProcessamentoRDO, LogAtividade
from app.database.session import SessionLocal
from app.core.pdf_extractor import (
    extrair_texto_pdf, extrair_nomes_do_rdo, extrair_cpfs, limpar_nome,
    extrair_colaboradores_pte, extrair_data_documento
)
from app.core.fuzzy_engine import processar_lista_nomes, buscar_melhor_match
from app.services.clima_service import obter_clima
from app.services.log_service import registrar_log

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
from config import (
    UPLOADS_DIR, ALLOWED_EXTENSIONS_PDF, ALLOWED_EXTENSIONS_EXCEL,
    VIP_NAMES
)

api = Blueprint("api", __name__, url_prefix="/api")


# ─────────────────────────────────────────────
# EFETIVO (Gestão de Colaboradores)
# ─────────────────────────────────────────────

import re as _re

def _limpar_cpf(valor: str) -> str:
    """Remove tudo que não for dígito do CPF. Retorna string com 11 dígitos ou menos."""
    return _re.sub(r'\D', '', str(valor or ''))

def _normalizar_nome(valor: str) -> str:
    """Aplica Title Case e remove espaços extras."""
    if not valor:
        return ''
    return _re.sub(r'\s+', ' ', str(valor).strip()).title()

def _normalizar_categoria(valor: str):
    """Aceita MOD, MOI (case insensitive); retorna em maiúsculas ou None."""
    if not valor:
        return None
    v = _re.sub(r'\s+', '', str(valor)).upper()
    return v if v in ('MOD', 'MOI') else None


@api.route("/efetivo/upload-excel", methods=["POST"])
def upload_excel():
    """Upload e importação de planilha Excel com dados de colaboradores."""
    if "file" not in request.files:
        return jsonify({"error": "Nenhum arquivo enviado"}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "Nome de arquivo vazio"}), 400

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS_EXCEL:
        return jsonify({"error": f"Extensão inválida. Use: {ALLOWED_EXTENSIONS_EXCEL}"}), 400

    db = SessionLocal()
    try:
        filename = secure_filename(file.filename)
        filepath = UPLOADS_DIR / filename
        file.save(str(filepath))

        wb = openpyxl.load_workbook(str(filepath), data_only=True)
        ws = wb.active

        # ── Detectar colunas (cabeçalhos flexíveis) ────────────
        headers = {}
        for col_idx, cell in enumerate(ws[1], 1):
            if cell.value:
                h = str(cell.value).strip().upper()
                if "NOME" in h or "FUNCIONÁRIO" in h or "COLABORADOR" in h:
                    headers["nome"] = col_idx
                elif "CPF" in h:
                    headers["cpf"] = col_idx
                elif "MATRÍCULA" in h or "MATRICULA" in h or h == "MAT":
                    headers["matricula"] = col_idx
                elif "CARGO" in h or "FUNÇÃO" in h or "FUNCAO" in h:
                    headers["cargo"] = col_idx
                elif "SETOR" in h or "DEPARTAMENTO" in h or "DEPTO" in h:
                    headers["setor"] = col_idx
                elif "CATEGORIA" in h or h in ("MOD", "MOI", "TIPO"):
                    headers["categoria"] = col_idx

        if "nome" not in headers:
            return jsonify({"error": "Coluna de NOME não encontrada. Verifique os cabeçalhos."}), 400

        importados = 0
        atualizados = 0
        erros = 0
        avisos = []

        for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=False), start=2):
            try:
                nome_cell = row[headers["nome"] - 1].value
                if not nome_cell or not str(nome_cell).strip():
                    continue

                # ── Padronização ───────────────────────────────
                nome = _normalizar_nome(str(nome_cell))

                # CPF: apenas dígitos, validar 11 chars
                cpf = None
                if "cpf" in headers and row[headers["cpf"] - 1].value:
                    cpf_raw = str(row[headers["cpf"] - 1].value).strip()
                    cpf_limpo = _limpar_cpf(cpf_raw)
                    if len(cpf_limpo) == 11:
                        cpf = cpf_limpo
                    else:
                        avisos.append(
                            f"Linha {row_idx}: CPF '{cpf_raw}' ignorado — deve ter 11 dígitos."
                        )

                matricula = None
                if "matricula" in headers and row[headers["matricula"] - 1].value:
                    matricula = str(row[headers["matricula"] - 1].value).strip()

                # Cargo: Title Case
                cargo = None
                if "cargo" in headers and row[headers["cargo"] - 1].value:
                    cargo = str(row[headers["cargo"] - 1].value).strip().title()

                setor = None
                if "setor" in headers and row[headers["setor"] - 1].value:
                    setor = str(row[headers["setor"] - 1].value).strip()

                # Categoria: MOD ou MOI
                categoria = None
                if "categoria" in headers and row[headers["categoria"] - 1].value:
                    cat_raw = str(row[headers["categoria"] - 1].value).strip()
                    categoria = _normalizar_categoria(cat_raw)
                    if not categoria:
                        avisos.append(
                            f"Linha {row_idx}: Categoria '{cat_raw}' ignorada — use MOD ou MOI."
                        )

                # ── Persistência ───────────────────────────────
                existente = None
                if cpf:
                    existente = db.query(Colaborador).filter(Colaborador.cpf == cpf).first()
                if not existente and matricula:
                    existente = db.query(Colaborador).filter(Colaborador.matricula == matricula).first()
                if not existente:
                    existente = db.query(Colaborador).filter(
                        func.lower(Colaborador.nome) == nome.lower()
                    ).first()

                if existente:
                    existente.nome = nome
                    if cpf:       existente.cpf = cpf
                    if matricula: existente.matricula = matricula
                    if cargo:     existente.cargo = cargo
                    if setor:     existente.setor = setor
                    if categoria: existente.categoria = categoria
                    existente.data_atualizacao = datetime.now(timezone.utc)
                    atualizados += 1
                else:
                    novo = Colaborador(
                        nome=nome, cpf=cpf, matricula=matricula,
                        cargo=cargo, setor=setor, categoria=categoria
                    )
                    db.add(novo)
                    importados += 1

            except Exception:
                erros += 1
                continue

        db.commit()

        registrar_log(db, "success", "efetivo",
                      f"Excel importado: {importados} novos, {atualizados} atualizados, {erros} erros",
                      f"Arquivo: {filename}")

        os.remove(str(filepath))

        return jsonify({
            "success": True,
            "importados": importados,
            "atualizados": atualizados,
            "erros": erros,
            "avisos": avisos,
            "total_base": db.query(Colaborador).count()
        })

    except Exception as e:
        db.rollback()
        return jsonify({"error": f"Erro ao processar Excel: {str(e)}"}), 500
    finally:
        db.close()



@api.route("/efetivo/modelo-padrao", methods=["GET"])
def baixar_modelo_padrao():
    """
    Gera e devolve um arquivo .xlsx de template para importação de
    colaboradores, com formatação, exemplos e validação de Categoria.
    """
    from io import BytesIO
    from flask import send_file
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
    from openpyxl.worksheet.datavalidation import DataValidation

    wb = openpyxl.Workbook()

    # ── Aba Colaboradores ──────────────────────────────────────
    ws = wb.active
    ws.title = "Colaboradores"

    verde   = "1A6B3C"   # verde Ipê
    verde_l = "EAF4EE"   # verde claro
    branco  = "FFFFFF"

    thin   = Side(style="thin", color="CCCCCC")
    borda  = Border(left=thin, right=thin, top=thin, bottom=thin)
    centro = Alignment(horizontal="center", vertical="center")
    topo   = Alignment(wrap_text=True, vertical="top")

    cabecalhos = [
        ("Nome Completo", 42),
        ("CPF",           22),
        ("Cargo",         30),
        ("Categoria",     16),
    ]

    for col, (titulo, larg) in enumerate(cabecalhos, 1):
        c = ws.cell(row=1, column=col, value=titulo)
        c.font      = Font(bold=True, color=branco, size=11)
        c.fill      = PatternFill("solid", fgColor=verde)
        c.alignment = centro
        c.border    = borda
        ws.column_dimensions[get_column_letter(col)].width = larg
    ws.row_dimensions[1].height = 24

    exemplos = [
        ("Ana Paula Bastos",  "000.000.000-00",  "Auxiliar Administrativo", "MOI"),
        ("Bruno Silva Lima",  "11122233344",     "Técnico Mecânico",        "MOD"),
        ("Carla Souza Costa", "55566677788",     "Encarregado",             "MOD"),
    ]
    fill_ex = PatternFill("solid", fgColor=verde_l)
    for r, linha in enumerate(exemplos, 2):
        for c, val in enumerate(linha, 1):
            cell = ws.cell(row=r, column=c, value=val)
            cell.fill      = fill_ex
            cell.alignment = topo
            cell.border    = borda
        ws.row_dimensions[r].height = 18

    ws.freeze_panes = "A2"

    # Validação de lista para Categoria (coluna D)
    dv = DataValidation(type="list", formula1='"MOD,MOI"', allow_blank=True)
    dv.sqref = "D2:D10000"
    ws.add_data_validation(dv)

    # ── Aba Instruções ─────────────────────────────────────────
    wi = wb.create_sheet("Instruções")
    wi.column_dimensions["A"].width = 22
    wi.column_dimensions["B"].width = 65

    cabec_f = Font(bold=True, color=branco, size=11)
    cabec_p = PatternFill("solid", fgColor=verde)
    titulo_f = Font(bold=True, size=13, color=verde)
    normal_f = Font(size=11)
    wrap_a   = Alignment(wrap_text=True, vertical="top")

    wi["A1"] = "MODELO PADRÃO DE IMPORTAÇÃO — SIPE"
    wi["A1"].font = titulo_f
    wi.merge_cells("A1:B1")
    wi["A1"].alignment = Alignment(horizontal="center", vertical="center")
    wi.row_dimensions[1].height = 28

    instrucoes = [
        ("Campo",          "Descrição / Regras"),
        ("Nome Completo",  "Nome sem abreviações. O sistema normaliza para Title Case: 'BRUNO BASTOS' vira 'Bruno Bastos'."),
        ("CPF",            "Aceita com ou sem máscara. O sistema remove pontos/traços e valida 11 dígitos."),
        ("Cargo",          "Nomenclatura oficial. O sistema normalizará as maiúsculas automaticamente."),
        ("Categoria",      "\"MOD\" (Mão de Obra Direta) ou \"MOI\" (Mão de Obra Indireta). Outros valores são descartados com aviso."),
    ]
    for r, (campo, desc) in enumerate(instrucoes, 3):
        ca = wi.cell(row=r, column=1, value=campo)
        cb = wi.cell(row=r, column=2, value=desc)
        if r == 3:
            ca.font = cabec_f; ca.fill = cabec_p
            cb.font = cabec_f; cb.fill = cabec_p
        else:
            ca.font = Font(bold=True, size=11)
            cb.font = normal_f
        ca.alignment = wrap_a
        cb.alignment = wrap_a
        wi.row_dimensions[r].height = 42

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)

    return send_file(
        buf,
        as_attachment=True,
        download_name="modelo_importacao_colaboradores.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )


@api.route("/efetivo/colaboradores", methods=["GET"])
def listar_colaboradores():
    """Lista todos os colaboradores cadastrados."""
    db = SessionLocal()
    try:
        busca = request.args.get("busca", "").strip()
        page = int(request.args.get("page", 1))
        per_page = int(request.args.get("per_page", 50))

        query = db.query(Colaborador).filter(Colaborador.ativo == True)

        if busca:
            query = query.filter(
                Colaborador.nome.ilike(f"%{busca}%") |
                Colaborador.cpf.ilike(f"%{busca}%") |
                Colaborador.matricula.ilike(f"%{busca}%")
            )

        total = query.count()
        colaboradores = query.order_by(Colaborador.nome).offset((page - 1) * per_page).limit(per_page).all()

        return jsonify({
            "colaboradores": [c.to_dict() for c in colaboradores],
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": (total + per_page - 1) // per_page
        })
    finally:
        db.close()


@api.route("/efetivo/colaboradores/<int:colab_id>", methods=["DELETE"])
def remover_colaborador(colab_id):
    """Remove (desativa) um colaborador."""
    db = SessionLocal()
    try:
        colab = db.query(Colaborador).get(colab_id)
        if not colab:
            return jsonify({"error": "Colaborador não encontrado"}), 404
        colab.ativo = False
        db.commit()
        registrar_log(db, "info", "efetivo", f"Colaborador desativado: {colab.nome}")
        return jsonify({"success": True, "mensagem": f"Colaborador {colab.nome} desativado"})
    finally:
        db.close()


@api.route("/efetivo/estatisticas", methods=["GET"])
def estatisticas_efetivo():
    """Retorna estatísticas do efetivo."""
    db = SessionLocal()
    try:
        total = db.query(Colaborador).filter(Colaborador.ativo == True).count()
        total_vinculos = db.query(Vinculo).count()
        vinculos_confirmados = db.query(Vinculo).filter(Vinculo.confirmado == True).count()

        return jsonify({
            "total_colaboradores": total,
            "total_vinculos": total_vinculos,
            "vinculos_confirmados": vinculos_confirmados,
        })
    finally:
        db.close()


# ─────────────────────────────────────────────
# PROCESSAMENTO RDO
# ─────────────────────────────────────────────

@api.route("/rdo/processar", methods=["POST"])
def processar_rdo():
    """Upload e processamento de PDF do RDO."""
    if "file" not in request.files:
        return jsonify({"error": "Nenhum arquivo PDF enviado"}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "Nome de arquivo vazio"}), 400

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS_PDF:
        return jsonify({"error": f"Extensão inválida. Use: {ALLOWED_EXTENSIONS_PDF}"}), 400

    db = SessionLocal()
    try:
        # Salvar PDF
        filename = secure_filename(file.filename)
        filepath = UPLOADS_DIR / filename
        file.save(str(filepath))

        # Criar registro de processamento
        proc = ProcessamentoRDO(
            nome_arquivo=filename,
            status="processando"
        )
        db.add(proc)
        db.commit()

        # Extrair texto do PDF
        texto = extrair_texto_pdf(str(filepath))
        nomes_extraidos = extrair_nomes_do_rdo(texto)

        # Buscar colaboradores na base
        colaboradores = db.query(Colaborador).filter(Colaborador.ativo == True).all()
        lista_colabs = [c.to_dict() for c in colaboradores]

        # Processar com fuzzy matching
        nomes_pdf = [n["nome_limpo"] for n in nomes_extraidos]
        resultados = processar_lista_nomes(nomes_pdf, lista_colabs, VIP_NAMES)

        # Salvar vínculos automáticos
        for match in resultados["automaticos"]:
            colab = db.query(Colaborador).filter(
                func.lower(Colaborador.nome) == match["match"].lower()
            ).first()
            if colab:
                vinculo_existente = db.query(Vinculo).filter(
                    Vinculo.nome_pdf == match["nome_pdf"],
                    Vinculo.colaborador_id == colab.id
                ).first()
                if not vinculo_existente:
                    vinculo = Vinculo(
                        nome_pdf=match["nome_pdf"],
                        colaborador_id=colab.id,
                        score_similaridade=match["score"],
                        confirmado=True
                    )
                    db.add(vinculo)

        # Atualizar registro de processamento
        proc.total_nomes_extraidos = len(nomes_extraidos)
        proc.total_matches_auto = resultados["estatisticas"]["automaticos"]
        proc.total_matches_revisao = resultados["estatisticas"]["revisao"]
        proc.total_sem_match = resultados["estatisticas"]["sem_match"]
        proc.status = "concluido"
        proc.resultado_json = json.dumps(resultados, ensure_ascii=False)

        db.commit()

        registrar_log(db, "success", "rdo",
                      f"RDO processado: {filename}",
                      f"Extraídos: {len(nomes_extraidos)}, Auto: {resultados['estatisticas']['automaticos']}, Revisão: {resultados['estatisticas']['revisao']}")

        # Limpar PDF
        os.remove(str(filepath))

        return jsonify({
            "success": True,
            "processamento_id": proc.id,
            "resultado": resultados,
            "nomes_extraidos": nomes_extraidos
        })

    except Exception as e:
        db.rollback()
        if 'proc' in locals():
            proc.status = "erro"
            proc.erro_mensagem = str(e)
            db.commit()
        registrar_log(db, "error", "rdo", f"Erro ao processar RDO: {str(e)}")
        return jsonify({"error": f"Erro ao processar RDO: {str(e)}"}), 500
    finally:
        db.close()


@api.route("/rdo/confirmar-vinculo", methods=["POST"])
def confirmar_vinculo():
    """Confirma ou rejeita um vínculo sugerido."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Dados inválidos"}), 400

    nome_pdf = data.get("nome_pdf")
    colaborador_id = data.get("colaborador_id")
    confirmar = data.get("confirmar", True)

    if not nome_pdf or not colaborador_id:
        return jsonify({"error": "nome_pdf e colaborador_id são obrigatórios"}), 400

    db = SessionLocal()
    try:
        if confirmar:
            vinculo = Vinculo(
                nome_pdf=nome_pdf,
                colaborador_id=colaborador_id,
                score_similaridade=data.get("score", 0),
                confirmado=True
            )
            db.add(vinculo)
            db.commit()
            registrar_log(db, "info", "rdo", f"Vínculo confirmado: '{nome_pdf}' → ID {colaborador_id}")
            return jsonify({"success": True, "mensagem": "Vínculo confirmado"})
        else:
            registrar_log(db, "info", "rdo", f"Vínculo rejeitado: '{nome_pdf}' → ID {colaborador_id}")
            return jsonify({"success": True, "mensagem": "Vínculo rejeitado"})
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@api.route("/rdo/historico", methods=["GET"])
def historico_processamentos():
    """Lista histórico de processamentos."""
    db = SessionLocal()
    try:
        procs = db.query(ProcessamentoRDO).order_by(ProcessamentoRDO.data_processamento.desc()).limit(50).all()
        return jsonify({"processamentos": [p.to_dict() for p in procs]})
    finally:
        db.close()


@api.route("/rdo/historico/<int:proc_id>", methods=["DELETE"])
def deletar_processamento(proc_id):
    """Remove um registro do histórico de processamentos."""
    db = SessionLocal()
    try:
        proc = db.query(ProcessamentoRDO).filter(ProcessamentoRDO.id == proc_id).first()
        if not proc:
            return jsonify({"error": "Processamento não encontrado"}), 404
        nome = proc.nome_arquivo
        db.delete(proc)
        db.commit()
        registrar_log(db, "info", "rdo", f"Histórico removido: {nome}")
        return jsonify({"success": True, "mensagem": f"Registro '{nome}' removido."})
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


# ─────────────────────────────────────────────
# PTE / CESLA (Leitura de Presença MOD)
# ─────────────────────────────────────────────

@api.route("/pte/processar", methods=["POST"])
def processar_pte():
    """
    Recebe um ou mais PDFs (campo 'files[]') do PTE/Cesla,
    extrai colaboradores MOD e retorna lista agrupada por data do documento.
    """
    arquivos = request.files.getlist("files[]")
    if not arquivos:
        # suporte alternativo: campo 'file' singular
        arquivo_single = request.files.get("file")
        if arquivo_single:
            arquivos = [arquivo_single]
        else:
            return jsonify({"error": "Nenhum arquivo PDF enviado"}), 400

    resultados = []  # lista de {arquivo, data, colaboradores}
    erros = []

    for file in arquivos:
        if not file or not file.filename:
            continue

        ext = Path(file.filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS_PDF:
            erros.append({"arquivo": file.filename, "erro": "Extensão inválida (apenas .pdf)"})
            continue

        try:
            filename = secure_filename(file.filename)
            filepath = UPLOADS_DIR / filename
            file.save(str(filepath))

            texto = extrair_texto_pdf(str(filepath))
            data_doc = extrair_data_documento(texto)
            colaboradores = extrair_colaboradores_pte(texto)

            # Limpar arquivo temporário
            try:
                os.remove(str(filepath))
            except Exception:
                pass

            resultados.append({
                "arquivo": file.filename,
                "data": data_doc,
                "total": len(colaboradores),
                "colaboradores": colaboradores,
            })

        except Exception as e:
            erros.append({"arquivo": file.filename, "erro": str(e)})
            try:
                os.remove(str(filepath))
            except Exception:
                pass

    if not resultados and erros:
        return jsonify({"error": "Todos os arquivos falharam", "detalhes": erros}), 400

    # Log
    db = SessionLocal()
    try:
        total_colabs = sum(r["total"] for r in resultados)
        registrar_log(
            db, "success", "pte",
            f"PTE processado: {len(resultados)} arquivo(s), {total_colabs} colaborador(es) MOD",
            f"Arquivos: {[r['arquivo'] for r in resultados]}"
        )
    finally:
        db.close()

    return jsonify({
        "success": True,
        "processados": len(resultados),
        "resultados": resultados,
        "erros": erros,
    })


# ─────────────────────────────────────────────
# CLIMA
# ─────────────────────────────────────────────

def ler_clima_config():
    config_path = Path(current_app.root_path).parent / 'data' / 'clima_settings.json'
    if config_path.exists():
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            pass
    return {"cidade": "Vila Velha", "estado": "ES", "lat": -20.3297, "lon": -40.2925}

def salvar_clima_config(dados):
    config_path = Path(current_app.root_path).parent / 'data' / 'clima_settings.json'
    config_path.parent.mkdir(parents=True, exist_ok=True)
    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(dados, f, ensure_ascii=False)

@api.route("/clima/config", methods=["GET"])
def get_clima_config():
    return jsonify(ler_clima_config())

@api.route("/clima/config", methods=["PUT"])
def update_clima_config():
    data = request.json
    cidade = data.get("cidade", "").strip()
    estado = data.get("estado", "").strip()
    
    if not cidade or not estado:
        return jsonify({"error": "Cidade e estado são obrigatórios"}), 400
        
    # Busca lat/lon
    from app.services.clima_service import buscar_coordenadas
    coords = buscar_coordenadas(cidade, estado)
    if not coords:
        return jsonify({"error": "Não foi possível encontrar as coordenadas para esta localização"}), 404
        
    config = {
        "cidade": coords['nome'],
        "estado": coords['estado'],
        "lat": coords['lat'],
        "lon": coords['lon']
    }
    salvar_clima_config(config)
    return jsonify({"success": True, "config": config})

@api.route("/clima", methods=["GET"])
def get_clima():
    """Retorna dados climáticos com configuração dinâmica."""
    forcar = request.args.get("forcar", "false").lower() == "true"
    conf = ler_clima_config()
    dados = obter_clima(cidade=conf['cidade'], estado=conf['estado'], lat=conf['lat'], lon=conf['lon'], forcar_atualizacao=forcar)
    return jsonify(dados)


# ─────────────────────────────────────────────
# SISTEMA / DASHBOARD
# ─────────────────────────────────────────────

@api.route("/dashboard/stats", methods=["GET"])
def dashboard_stats():
    """Estatísticas gerais para o dashboard."""
    db = SessionLocal()
    try:
        total_colabs = db.query(Colaborador).filter(Colaborador.ativo == True).count()
        total_processamentos = db.query(ProcessamentoRDO).count()
        ultimo_proc = db.query(ProcessamentoRDO).order_by(ProcessamentoRDO.data_processamento.desc()).first()
        total_vinculos = db.query(Vinculo).filter(Vinculo.confirmado == True).count()

        logs_recentes = db.query(LogAtividade).order_by(LogAtividade.data.desc()).limit(10).all()

        return jsonify({
            "total_colaboradores": total_colabs,
            "total_processamentos": total_processamentos,
            "total_vinculos_confirmados": total_vinculos,
            "ultimo_processamento": ultimo_proc.to_dict() if ultimo_proc else None,
            "logs_recentes": [l.to_dict() for l in logs_recentes]
        })
    finally:
        db.close()


@api.route("/logs", methods=["GET"])
def get_logs():
    """Retorna logs do sistema."""
    db = SessionLocal()
    try:
        modulo = request.args.get("modulo")
        limite = int(request.args.get("limite", 50))

        query = db.query(LogAtividade).order_by(LogAtividade.data.desc())
        if modulo:
            query = query.filter(LogAtividade.modulo == modulo)
        logs = query.limit(limite).all()

        return jsonify({"logs": [l.to_dict() for l in logs]})
    finally:
        db.close()
