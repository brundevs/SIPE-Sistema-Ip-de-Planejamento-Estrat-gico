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
    extrair_texto_pdf, extrair_nomes_do_rdo, extrair_cpfs, limpar_nome
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
        # Salvar arquivo
        filename = secure_filename(file.filename)
        filepath = UPLOADS_DIR / filename
        file.save(str(filepath))

        # Processar Excel
        wb = openpyxl.load_workbook(str(filepath), data_only=True)
        ws = wb.active

        # Detectar colunas (busca flexível nos cabeçalhos)
        headers = {}
        for col_idx, cell in enumerate(ws[1], 1):
            if cell.value:
                header = str(cell.value).strip().upper()
                if "NOME" in header or "FUNCIONÁRIO" in header or "COLABORADOR" in header:
                    headers["nome"] = col_idx
                elif "CPF" in header:
                    headers["cpf"] = col_idx
                elif "MATRÍCULA" in header or "MATRICULA" in header or "MAT" == header:
                    headers["matricula"] = col_idx
                elif "CARGO" in header or "FUNÇÃO" in header or "FUNCAO" in header:
                    headers["cargo"] = col_idx
                elif "SETOR" in header or "DEPARTAMENTO" in header or "DEPTO" in header:
                    headers["setor"] = col_idx

        if "nome" not in headers:
            return jsonify({"error": "Coluna de NOME não encontrada na planilha. Verifique os cabeçalhos."}), 400

        importados = 0
        atualizados = 0
        erros = 0

        for row in ws.iter_rows(min_row=2, values_only=False):
            try:
                nome_cell = row[headers["nome"] - 1].value
                if not nome_cell or not str(nome_cell).strip():
                    continue

                nome = limpar_nome(str(nome_cell))
                cpf = str(row[headers["cpf"] - 1].value).strip() if "cpf" in headers and row[headers["cpf"] - 1].value else None
                matricula = str(row[headers["matricula"] - 1].value).strip() if "matricula" in headers and row[headers["matricula"] - 1].value else None
                cargo = str(row[headers["cargo"] - 1].value).strip() if "cargo" in headers and row[headers["cargo"] - 1].value else None
                setor = str(row[headers["setor"] - 1].value).strip() if "setor" in headers and row[headers["setor"] - 1].value else None

                # Verificar se já existe (por CPF ou matrícula ou nome)
                existente = None
                if cpf:
                    existente = db.query(Colaborador).filter(Colaborador.cpf == cpf).first()
                if not existente and matricula:
                    existente = db.query(Colaborador).filter(Colaborador.matricula == matricula).first()
                if not existente:
                    existente = db.query(Colaborador).filter(func.lower(Colaborador.nome) == nome.lower()).first()

                if existente:
                    # Atualizar dados existentes
                    existente.nome = nome
                    if cpf: existente.cpf = cpf
                    if matricula: existente.matricula = matricula
                    if cargo: existente.cargo = cargo
                    if setor: existente.setor = setor
                    existente.data_atualizacao = datetime.now(timezone.utc)
                    atualizados += 1
                else:
                    novo = Colaborador(
                        nome=nome, cpf=cpf, matricula=matricula,
                        cargo=cargo, setor=setor
                    )
                    db.add(novo)
                    importados += 1

            except Exception as e:
                erros += 1
                continue

        db.commit()

        registrar_log(db, "success", "efetivo",
                      f"Excel importado: {importados} novos, {atualizados} atualizados, {erros} erros",
                      f"Arquivo: {filename}")

        # Limpar arquivo temporário
        os.remove(str(filepath))

        return jsonify({
            "success": True,
            "importados": importados,
            "atualizados": atualizados,
            "erros": erros,
            "total_base": db.query(Colaborador).count()
        })

    except Exception as e:
        db.rollback()
        return jsonify({"error": f"Erro ao processar Excel: {str(e)}"}), 500
    finally:
        db.close()


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
        procs = db.query(ProcessamentoRDO).order_by(ProcessamentoRDO.data_processamento.desc()).limit(20).all()
        return jsonify({"processamentos": [p.to_dict() for p in procs]})
    finally:
        db.close()


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
