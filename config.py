"""
SIPE | Sistema Ipê de Planejamento Estratégico - Configurações Globais
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "storage.db"

# Garantir que os diretórios existam
DATA_DIR.mkdir(exist_ok=True)
UPLOADS_DIR.mkdir(exist_ok=True)

# Banco de Dados
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

# Configurações do Flask
SECRET_KEY = os.environ.get("SECRET_KEY", "rdo-promax-v2-secret-key-2026")
DEBUG = os.environ.get("DEBUG", "True").lower() == "true"

# Configurações de Fuzzy Matching
FUZZY_THRESHOLD_AUTO = 90      # Acima disso: match automático
FUZZY_THRESHOLD_REVIEW = 60    # Entre 60-90: revisão humana
FUZZY_THRESHOLD_REJECT = 60    # Abaixo disso: rejeitado

# Configurações de Clima
CLIMA_CACHE_FILE = DATA_DIR / "dados_clima_gloria.json"
CLIMA_CACHE_TTL_MINUTES = 30

# Nomes VIP (busca prioritária)
VIP_NAMES = []

# Upload
MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50MB
ALLOWED_EXTENSIONS_PDF = {".pdf"}
ALLOWED_EXTENSIONS_EXCEL = {".xlsx", ".xls"}
