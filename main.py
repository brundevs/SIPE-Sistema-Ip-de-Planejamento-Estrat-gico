"""
SIPE | Sistema Ipê de Planejamento Estratégico - Entry Point do Servidor Local
Inicializa Flask, registra rotas e inicia o servidor.
"""
import os
import sys
from pathlib import Path

# Adicionar diretório raiz ao path
ROOT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT_DIR))

from flask import Flask, render_template, send_from_directory
from flask_cors import CORS
from config import SECRET_KEY, DEBUG, DATA_DIR, UPLOADS_DIR, PDFS_DIR
from app.database.session import init_db
from app.web.routes import api


def create_app():
    """Factory de criação da aplicação Flask."""
    app = Flask(
        __name__,
        template_folder=str(ROOT_DIR / "frontend" / "templates"),
        static_folder=str(ROOT_DIR / "frontend" / "static"),
    )

    app.config["SECRET_KEY"] = SECRET_KEY
    app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50MB

    # CORS: em produção, restrinja origens via variável de ambiente CORS_ORIGINS
    cors_origins = os.environ.get("CORS_ORIGINS", "*")
    CORS(app, origins=cors_origins)

    # Registrar blueprint de API
    app.register_blueprint(api)

    # ── Rotas SPA (todas servem index.html) ───
    @app.route("/")
    def index():
        return render_template("index.html")

    @app.route("/<path:path>")
    def spa_fallback(path):
        """Rota catch-all para o SPA — suporta navegação direta por URL."""
        return render_template("index.html")

    # Garantir diretórios
    DATA_DIR.mkdir(exist_ok=True)
    UPLOADS_DIR.mkdir(exist_ok=True)
    PDFS_DIR.mkdir(exist_ok=True)

    # Inicializar banco de dados
    with app.app_context():
        init_db()

    return app


if __name__ == "__main__":
    app = create_app()
    print("\n" + "=" * 60)
    print("  [SIPE]  SIPE | Sistema Ipê de Planejamento Estratégico  --  Sistema Iniciado!")
    print("=" * 60)
    print(f"  [WEB]  Acesse: http://localhost:5000")
    print(f"  [DIR]  Dados: {DATA_DIR}")
    print("=" * 60 + "\n")
    app.run(host="0.0.0.0", port=5000, debug=DEBUG)
