# SIPE | Sistema Ipê de Planejamento Estratégico

Plataforma web de gestão empresarial para obras e serviços industriais — controle de efetivo, processamento inteligente de documentos PTe/Cesla, planejamento de obras com Curva S e integração climática em tempo real.

## Principais Funcionalidades

- **Dashboard Executivo** — KPIs em tempo real, logs e efetivo do último PTe
- **Gestão de Efetivo (MOD/MOI)** — Importação via Excel com detecção flexível de colunas, deduplicação automática e exportação formatada
- **Leitura Inteligente de PTe/Cesla** — Motor de extração multi-estratégia (CPF, matrícula, fuzzy matching) que identifica colaboradores presentes e injeta MOI automaticamente
- **Histórico Consolidado** — Busca de pessoa em todos os registros com horários de presença
- **Liberação de Acessos** — Autocomplete unificado e geração de texto padronizado para portaria
- **Clima em Tempo Real** — Previsão 10 dias via Open-Meteo, por turno, com cache automático
- **Planejamento de Obras** — Importação de MS Project (CSV/XLSX/XML), Gantt, Curva S, Histograma de Recursos
- **RDO Diário** — Relatório automático combinando efetivo, clima e cronograma

## Stack Tecnológico

| Camada | Tecnologias |
|--------|-------------|
| **Backend** | Python 3.9+ · Flask 3.1 · SQLAlchemy 2.0 · SQLite |
| **PDF** | pdfplumber 0.11 · regex multi-estratégia |
| **Matching** | TheFuzz (token_sort_ratio) com threshold configurável |
| **Excel** | openpyxl 3.1 (leitura + geração formatada) |
| **Clima** | Open-Meteo API (sem chave) + cache JSON 30min |
| **Frontend** | Vanilla JS/HTML/CSS · Chart.js 4.4 · Glassmorphism |

## Instalação

```bash
# 1. Instalar dependências
pip install -r requirements.txt

# 2. Configurar ambiente (opcional)
copy .env.example .env
# Edite .env se necessário

# 3. Iniciar servidor
python main.py

# Acesse: http://localhost:5000
```

## Estrutura do Projeto

```
app/core/         → Motores de PDF e fuzzy matching
app/database/     → Modelos ORM e migrações automáticas
app/services/     → Clima e logs
app/web/routes.py → 50+ endpoints REST
frontend/         → SPA (HTML + JS + CSS)
data/             → SQLite, PDFs e cache
```

## Documentação Técnica

Consulte **[TECH_STACK.md](TECH_STACK.md)** para documentação completa:
- Descrição detalhada de todos os módulos
- Referência completa da API REST
- Schema do banco de dados
- Guia para adicionar novas funcionalidades

## Licença

Sistema Proprietário. Desenvolvido para gestão privada e estratégica.
