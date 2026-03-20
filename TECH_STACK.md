# SIPE — Documentação Técnica Completa

**Sistema Ipê de Planejamento Estratégico**
Versão: 2.0 | Atualizado: Março 2026

---

## Sumário

1. [Visão Geral](#1-visão-geral)
2. [Stack Tecnológico](#2-stack-tecnológico)
3. [Arquitetura](#3-arquitetura)
4. [Módulos e Funcionalidades](#4-módulos-e-funcionalidades)
5. [API REST — Endpoints](#5-api-rest--endpoints)
6. [Banco de Dados](#6-banco-de-dados)
7. [Motor de Extração de PDF](#7-motor-de-extração-de-pdf)
8. [Motor Fuzzy](#8-motor-fuzzy)
9. [Frontend SPA](#9-frontend-spa)
10. [Configuração e Deploy](#10-configuração-e-deploy)
11. [Variáveis de Ambiente](#11-variáveis-de-ambiente)
12. [Guia para Novas Funcionalidades](#12-guia-para-novas-funcionalidades)

---

## 1. Visão Geral

O **SIPE** é uma aplicação web de gestão empresarial para obras e serviços industriais. Automatiza o controle de efetivo, processamento de documentos de Permissão de Trabalho (PTe/Cesla), planejamento de obras com Curva S e integração com dados climáticos em tempo real.

### Casos de Uso Principais

| Usuário | Ação | Resultado |
|---------|------|-----------|
| Encarregado | Faz upload de PDFs de PTe/Cesla | Lista de presença MOD+MOI gerada automaticamente |
| Administrativo | Importa planilha Excel de efetivo | Base de colaboradores atualizada com deduplicação |
| Portaria | Busca motorista/prestador | Texto de liberação de acesso gerado em segundos |
| Planejador | Importa cronograma do MS Project | Gantt, Curva S e Histograma de Recursos gerados |
| Gerente | Acessa dashboard | KPIs consolidados em tempo real |

---

## 2. Stack Tecnológico

### Backend

| Tecnologia | Versão | Propósito |
|------------|--------|-----------|
| **Python** | 3.9+ | Linguagem principal |
| **Flask** | 3.1.0 | Framework web WSGI |
| **Flask-CORS** | 5.0.1 | Política de origens cruzadas |
| **SQLAlchemy** | 2.0.36 | ORM e abstração do banco de dados |
| **SQLite** | built-in | Banco de dados padrão (local) |
| **pdfplumber** | 0.11.4 | Extração de texto e tabelas de PDF |
| **TheFuzz** | 0.22.1 | Fuzzy matching probabilístico de strings |
| **openpyxl** | 3.1.5 | Leitura e geração de planilhas Excel |
| **requests** | 2.32.3 | Cliente HTTP para APIs externas |
| **python-dotenv** | 1.0.1 | Carregamento de variáveis de ambiente (.env) |
| **Werkzeug** | 3.1.3 | Utilitários WSGI (secure_filename, etc.) |

### Frontend

| Tecnologia | Propósito |
|------------|-----------|
| **Vanilla JS (ES6+)** | Lógica SPA sem framework |
| **HTML5 / CSS3** | Markup e estilização |
| **Chart.js 4.4.0** | Gráficos (Gantt, Curva S, Histograma) |
| **Google Fonts** | Inter (UI) + JetBrains Mono (código) |

### APIs Externas

| Serviço | Uso | Autenticação |
|---------|-----|--------------|
| **Open-Meteo Forecast API** | Previsão do tempo (10 dias) | Sem chave (gratuita) |
| **Open-Meteo Archive API** | Dados históricos de clima | Sem chave (gratuita) |
| **Open-Meteo Geocoding API** | Geolocalização de cidades | Sem chave (gratuita) |

### Ferramentas de Desenvolvimento

- **Git** — controle de versão
- **pip / venv** — gerenciamento de dependências Python

---

## 3. Arquitetura

```
SIPE-MAIN/
├── main.py                    # Entry point — Flask app factory
├── config.py                  # Configurações globais e constantes
├── requirements.txt           # Dependências Python
├── .env.example               # Template de variáveis de ambiente
│
├── app/
│   ├── core/                  # Inteligência de negócio
│   │   ├── pdf_extractor.py   # Motor de extração de PDF (regex + pdfplumber)
│   │   └── fuzzy_engine.py    # Motor de matching probabilístico (TheFuzz)
│   │
│   ├── database/              # Camada de persistência
│   │   ├── models.py          # 12 modelos SQLAlchemy ORM
│   │   └── session.py         # Engine, SessionLocal, init_db, migrações
│   │
│   ├── services/              # Serviços auxiliares
│   │   ├── clima_service.py   # Integração Open-Meteo + cache JSON
│   │   └── log_service.py     # Registro de atividades no banco
│   │
│   └── web/
│       └── routes.py          # 50+ endpoints REST (Flask Blueprint)
│
├── frontend/
│   ├── templates/
│   │   └── index.html         # SPA shell (único HTML)
│   └── static/
│       ├── css/styles.css     # Design system Glassmorphism
│       ├── js/app.js          # Lógica SPA completa
│       └── img/logo.svg       # Logotipo SVG
│
└── data/
    ├── storage.db             # Banco SQLite (gerado automaticamente)
    ├── pdfs/                  # PDFs permanentes processados
    └── uploads/               # Upload temporário (auto-limpo)
```

### Padrão de Comunicação

```
Browser SPA  ──→  Flask Blueprint (/api/*)  ──→  Services/Core  ──→  SQLite DB
                                                      │
                                                      └──→  Open-Meteo API (HTTP)
```

- O frontend é uma **SPA** — todas as rotas são servidas pelo mesmo `index.html`
- A API segue padrão **REST** com respostas JSON
- Sem autenticação (sistema local/intranet single-user por design)

---

## 4. Módulos e Funcionalidades

### 4.1 Dashboard Executivo

- KPIs em tempo real: total de colaboradores, MOD/MOI, processamentos, vínculos confirmados
- Efetivo do último PTe processado
- Feed de logs do sistema (últimas 10 atividades)
- Widget de clima integrado no topbar

### 4.2 Gestão de Efetivo

**Importação via Excel:**
- Detecção automática de colunas (cabeçalho flexível)
- Normalização de nomes (Title Case), limpeza de CPF, validação de categoria
- Deduplicação por CPF → Matrícula → Nome (case-insensitive)
- Retorno detalhado: importados / atualizados / erros / avisos

**Operações CRUD:**
- Listagem paginada com busca por nome, CPF ou matrícula
- Adição manual com validação
- Edição inline de todos os campos
- Desativação lógica (soft delete — campo `ativo`)
- Atualização rápida de categoria (MOD/MOI)

**Exportação:**
- Geração dinâmica de `.xlsx` formatado com zebra striping
- Template de importação com validação de lista (dropdown MOD/MOI) e aba de instruções

### 4.3 Leitura de PTe/Cesla (Processamento de PDF)

**Fluxo completo:**
1. Upload de 1 a N PDFs via drag & drop
2. Extração de texto via `pdfplumber`
3. Extração de: data do documento, Data/Hora efetiva início/fim, colaboradores MOD, CPFs, Permissões de Trabalho, dados de planejamento (ID Atividade, ID PTe, descrição)
4. Matching em 4 níveis: CPF exato → Matrícula exata → Fuzzy (≥65%) → Nome exato
5. Injeção automática de **todos** os colaboradores MOI ativos
6. Armazenamento permanente dos PDFs em `data/pdfs/` com prefixo de timestamp
7. Confirmação pelo usuário → registro no histórico

**Estratégias de extração de nomes:**
| Prioridade | Estratégia | Confiança |
|------------|------------|-----------|
| 1 | Linha com CPF formatado + Nome | Alta |
| 2 | Linha com CPF numérico (11 dígitos) + Nome | Alta |
| 3 | Lista numerada em maiúsculas | Média |
| 4 | Linhas com 75%+ caracteres maiúsculos | Baixa |

### 4.4 Histórico de Processamentos (RDO)

- Listagem de todos os processamentos confirmados
- **Busca por pessoa**: varre o JSON interno de todos os registros para localizar em quais datas determinado colaborador esteve presente
- Download dos PDFs vinculados ao registro
- Deleção de registros do histórico

### 4.5 Liberação de Acessos (Portaria)

- Autocomplete unificado: busca em Colaboradores e HistoricoTerceiro simultaneamente
- Preenchimento automático do formulário ao selecionar resultado
- Geração de texto de liberação padronizado para WhatsApp/portaria
- Auto-cadastro de visitantes/prestadores não encontrados
- Histórico completo com busca e deleção

### 4.6 Clima em Tempo Real

- Fonte: Open-Meteo (gratuita, sem API key)
- Cache local em JSON com TTL de 30 minutos
- Dados: temperatura atual, umidade, vento, precipitação
- Previsão de 10 dias com ícones, máxima/mínima, probabilidade de chuva
- Breakdown por turno (manhã/tarde/noite) com dados horários
- Configuração dinâmica de localidade (geocoding automático)
- Integrado automaticamente nos relatórios de obra

### 4.7 Planejamento de Obras (Cronograma)

**Importação de cronogramas:**
- `.xlsx` / `.xls` — planilhas Excel genéricas
- `.csv` / `.tsv` / `.txt` — formato MS Project exportado
- `.xml` — MS Project XML (com predecessoras, recursos e datas reais)

**Funcionalidades:**
- Hierarquia WBS (Work Breakdown Structure) com níveis de indentação
- Identificação de caminho crítico
- **Curva S**: previsto vs. realizado (ponderado por peso/duração)
- **Curva S Semanal**: tabela com desvio acumulado por semana
- **Histograma de Recursos**: MO e Equipamentos previstos vs. reais por semana
- Editor inline de tarefas (salva em lote)
- Exportação do cronograma em `.xlsx` formatado
- Template de exemplo `.tsv` disponível para download

### 4.8 RDO Diário de Obra

- Relatório automático para uma data específica
- Combina: efetivo presente (do histórico PTe), clima do dia, atividades do cronograma previstas para a data, Permissões de Trabalho ativas
- Horários efetivos de início e fim consolidados dos PTes

### 4.9 Segurança do Trabalho

- Listagem de Permissões de Trabalho (PT) extraídas dos PDFs
- Filtro por data
- Vinculação com processamentos PTe

---

## 5. API REST — Endpoints

### Efetivo

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `POST` | `/api/efetivo/upload-excel` | Importar planilha Excel |
| `GET` | `/api/efetivo/modelo-padrao` | Baixar template Excel |
| `GET` | `/api/efetivo/colaboradores` | Listar (paginado, busca) |
| `POST` | `/api/efetivo/adicionar` | Adicionar manualmente |
| `PUT` | `/api/efetivo/colaboradores/<id>` | Editar colaborador |
| `DELETE` | `/api/efetivo/colaboradores/<id>` | Desativar colaborador |
| `PUT` | `/api/efetivo/colaboradores/<id>/categoria` | Atualizar MOD/MOI |
| `GET` | `/api/efetivo/exportar` | Exportar como xlsx |
| `GET` | `/api/efetivo/estatisticas` | KPIs do efetivo |

### PTe / RDO

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `POST` | `/api/pte/processar` | Processar PDFs PTe (lote) |
| `POST` | `/api/pte/confirmar` | Confirmar e salvar no histórico |
| `POST` | `/api/rdo/processar` | Processar PDF RDO (único) |
| `POST` | `/api/rdo/confirmar-vinculo` | Confirmar vínculo fuzzy |
| `GET` | `/api/rdo/historico` | Listar histórico |
| `DELETE` | `/api/rdo/historico/<id>` | Remover registro |
| `GET` | `/api/rdo/historico/<id>/pdf/<filename>` | Download PDF vinculado |

### Acesso (Portaria)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/acesso/buscar?q=` | Autocomplete unificado |
| `POST` | `/api/acesso/liberar` | Registrar liberação |
| `GET` | `/api/acesso/historico-liberacoes` | Listar histórico |
| `DELETE` | `/api/acesso/historico-liberacoes/<id>` | Remover registro |

### Clima

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/clima` | Dados clima atual + previsão |
| `GET` | `/api/clima/config` | Configuração de localidade |
| `PUT` | `/api/clima/config` | Atualizar localidade |

### Planejamento de Obras

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/projetos` | Listar projetos |
| `POST` | `/api/projetos` | Criar projeto |
| `GET` | `/api/projetos/<id>` | Detalhe + tarefas |
| `DELETE` | `/api/projetos/<id>` | Deletar projeto |
| `POST` | `/api/projetos/<id>/importar` | Importar CSV/XLSX |
| `POST` | `/api/projetos/<id>/importar-xml` | Importar MS Project XML |
| `GET` | `/api/projetos/<id>/curva-s` | Dados Curva S |
| `GET` | `/api/projetos/<id>/curva-s-semanal` | Curva S breakdown semanal |
| `GET` | `/api/projetos/<id>/histograma` | Histograma de recursos |
| `GET` | `/api/projetos/<id>/exportar` | Exportar cronograma xlsx |
| `GET` | `/api/projetos/<id>/modelo-csv` | Baixar template TSV |
| `PUT` | `/api/tarefas/<id>` | Atualizar tarefa |
| `POST` | `/api/projetos/<id>/salvar-editor` | Salvar editor em lote |

### PTe Obra / Histórico PTe

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/pte-obra/registros` | Listar registros |
| `PATCH` | `/api/pte-obra/registros/<id>` | Editar horários |
| `GET` | `/api/pte-obra/registros/<id>/detalhes` | Colaboradores + PDFs |
| `DELETE` | `/api/pte-obra/registros/<id>` | Remover registro |

### Cadastros Base

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET/POST` | `/api/equipamentos` | Listar / Criar equipamento |
| `PUT/DELETE` | `/api/equipamentos/<id>` | Editar / Remover |
| `GET/POST` | `/api/veiculos` | Listar / Criar veículo |
| `PUT/DELETE` | `/api/veiculos/<id>` | Editar / Remover |
| `GET/POST` | `/api/terceiros` | Listar / Criar terceiro |
| `PUT/DELETE` | `/api/terceiros/<id>` | Editar / Remover |

### Sistema

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/dashboard/stats` | KPIs do dashboard |
| `GET` | `/api/seguranca/permissoes` | Listar PTs |
| `GET` | `/api/rdo-obra/dados?data=` | RDO completo de uma data |
| `GET` | `/api/logs` | Logs do sistema |

---

## 6. Banco de Dados

### Diagrama de Entidades

```
Colaborador (1) ──→ (N) Vinculo
Colaborador: id, nome, cpf, matricula, cargo, setor, categoria(MOD/MOI), empresa, ativo

Vinculo: nome_pdf, colaborador_id, score_similaridade, confirmado

ProcessamentoRDO (1) ──→ (N) PermissaoTrabalho
ProcessamentoRDO (1) ──→ (N) PteObraRegistro
ProcessamentoRDO: nome_arquivo, status, total_nomes, resultado_json, pdfs_json, horarios

Projeto (1) ──→ (N) Tarefa
Tarefa: codigo(WBS), nome, nivel, ordem, datas_prev, datas_real, progresso, predecessoras(JSON)

HistoricoTerceiro: nome, cpf, placa, empresa, local, motivo
HistoricoLiberacao: motorista, cpf, texto_gerado, periodo, data_acesso
LogAtividade: tipo, modulo, mensagem, data
Equipamento: nome, codigo, status
Veiculo: placa, modelo, empresa
```

### Migrações

O SIPE implementa **migração automática** na inicialização (`session.py:_migrate_missing_columns`):

- Compara o schema dos modelos com as tabelas existentes via `PRAGMA table_info`
- Executa `ALTER TABLE ADD COLUMN` para colunas novas
- **Seguro para SQLite** — sem perda de dados, apenas adições

Para adicionar uma nova coluna a um modelo existente:
1. Adicione o campo no modelo em `models.py`
2. Reinicie o servidor — a migração ocorre automaticamente

### Configuração SQLite

```python
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},  # Thread-safe para Flask
    echo=False,
    pool_pre_ping=True,  # Verifica conexão antes de usar
)
```

---

## 7. Motor de Extração de PDF

**Arquivo:** `app/core/pdf_extractor.py`

### Pipeline de Extração PTe

```
PDF → pdfplumber.extract_text() → Texto bruto
    ↓
    ├── extrair_data_documento()     → "DD/MM/YYYY" ou "Sem Data"
    ├── extrair_horarios_pte()       → (inicio, fim) datetime strings
    ├── extrair_colaboradores_pte()  → Lista de {nome, cpf, matricula, cargo}
    │     ├── Estratégia 1: Linha com CPF formatado (000.000.000-00)
    │     ├── Estratégia 2: Linha com CPF numérico (11 dígitos)
    │     ├── Estratégia 3: Lista numerada em maiúsculas
    │     └── Estratégia 4: Linhas 75%+ maiúsculas (fallback)
    ├── extrair_cpfs()               → Lista de CPFs válidos do texto inteiro
    ├── extrair_permissoes_trabalho() → Lista de {numero_pt, descricao}
    └── extrair_dados_pte_obra()     → {id_atividade, id_pte, hora_inicio, hora_fim, descricao}
```

### Validação de CPF

Implementada com dígitos verificadores completos (algoritmo oficial):

```python
def validar_cpf(cpf: str) -> bool:
    # Rejeita sequências iguais (000.000.000-00, etc.)
    # Valida 1º dígito: Σ(dígito[i] × (10-i)) × 10 mod 11
    # Valida 2º dígito: Σ(dígito[i] × (11-i)) × 10 mod 11
```

### Stop-Words para Nomes

O extrator filtra automaticamente palavras que não são nomes de pessoas:
- Cabeçalhos de tabela: MOD, MOI, CPF, NOME, CARGO...
- Verbos de atividade: EXECUTAR, INSTALAR, SOLDAR, IÇAR...
- Equipamentos: GUINDASTE, CAMINHÃO...

---

## 8. Motor Fuzzy

**Arquivo:** `app/core/fuzzy_engine.py`

### Algoritmo de Matching

Usa `token_sort_ratio` do TheFuzz, que:
- Ordena os tokens antes de comparar → resistente a inversão de nome/sobrenome
- Ex: "João Silva Costa" vs "Costa João Silva" → score 100

### Níveis de Confiança

| Score | Status | Ação |
|-------|--------|------|
| ≥ 90 | `auto` | Match confirmado automaticamente |
| 60–89 | `revisao` | Aguarda confirmação humana |
| < 60 | `sem_match` | Rejeitado |

### Ordem de Busca no PTE

1. **CPF exato** — lookup em dicionário O(1)
2. **Matrícula exata** — lookup em dicionário O(1)
3. **Fuzzy** — token_sort_ratio (threshold ≥ 65% para PTe)
4. **Nome exato** (case-insensitive) — varredura linear

### Aprendizado Persistente

Matches confirmados são salvos como `Vinculo`:
- `nome_pdf` → `colaborador_id` com `score_similaridade` e `confirmado=True`
- Histórico consultável para auditoria

---

## 9. Frontend SPA

### Estrutura do App (app.js)

```javascript
// Navegação SPA
navigateTo(page)          // Troca de seção sem reload
apiCall(url, options)     // Wrapper fetch com tratamento de erro

// Notificações
showToast(msg, type)      // Notificações temporárias (success/error/warning/info)
showLoading(text)         // Overlay de carregamento
showModal(title, html)    // Modal genérico

// Módulos
loadDashboard()           // KPIs + logs
loadColaboradores()       // Tabela paginada + busca
handlePteUpload(input)    // Upload múltiplo de PDFs
loadClima()               // Widget meteorológico
// ... e 30+ funções de módulos
```

### Design System (styles.css)

**Paleta de cores:**

| Variável | Hex | Uso |
|----------|-----|-----|
| `--primary` | `#00c580` | Ações primárias, destaques |
| `--primary-dark` | `#005a3b` | Headers, sidebar |
| `--accent` | `#00e7e7` | Acentos, hover |
| `--success` | `#00ac70` | Sucesso |
| `--warning` | `#f59e0b` | Alertas |
| `--error` | `#ef4444` | Erros |
| `--text-primary` | `#001841` | Texto principal |
| `--bg-primary` | `#f4f7f6` | Fundo da página |

**Componentes disponíveis:**
- Cards com glassmorphism (`card`, `stat-card`)
- Botões (`btn-primary`, `btn-secondary`, `btn-ghost`, tamanhos `btn-sm`/`btn-lg`)
- Upload zones com drag & drop
- Tabelas responsivas com zebra striping
- Toasts e modais
- Sidebar colapsável (280px → 72px)
- Formulários com labels flutuantes

---

## 10. Configuração e Deploy

### Instalação Local

```bash
# 1. Clone e entre no diretório
cd SIPE-MAIN

# 2. Crie ambiente virtual (recomendado)
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # Linux/macOS

# 3. Instale dependências
pip install -r requirements.txt

# 4. Configure variáveis de ambiente
copy .env.example .env        # Windows
# cp .env.example .env        # Linux/macOS
# Edite .env com seus valores

# 5. Inicie o servidor
python main.py

# Acesse: http://localhost:5000
```

### Deploy em Produção (Gunicorn + Nginx)

```bash
# Instalar Gunicorn
pip install gunicorn

# Rodar com workers
gunicorn "main:create_app()" --workers 4 --bind 0.0.0.0:8000

# Nginx como proxy reverso (nginx.conf):
# location / { proxy_pass http://127.0.0.1:8000; }
# location /static/ { alias /path/to/SIPE-MAIN/frontend/static/; }
```

### Deploy com Docker (exemplo)

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn
COPY . .
EXPOSE 8000
CMD ["gunicorn", "main:create_app()", "--workers", "2", "--bind", "0.0.0.0:8000"]
```

---

## 11. Variáveis de Ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `SECRET_KEY` | *(hardcoded — trocar!)* | Chave secreta Flask para sessões |
| `DEBUG` | `True` | Modo debug (use `False` em produção) |
| `CORS_ORIGINS` | `*` | Origens permitidas (ex: `https://meusite.com`) |

**Geração de SECRET_KEY segura:**
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

---

## 12. Guia para Novas Funcionalidades

### Adicionar um Novo Módulo Backend

1. **Criar modelo** em `app/database/models.py`:
```python
class MeuModelo(Base):
    __tablename__ = "meu_modulo"
    id = Column(Integer, primary_key=True, autoincrement=True)
    nome = Column(String(255), nullable=False)
    # ... campos
    def to_dict(self): ...
```

2. **Adicionar rotas** em `app/web/routes.py`:
```python
@api.route("/meu-modulo", methods=["GET"])
def listar_meu_modulo():
    db = SessionLocal()
    try:
        items = db.query(MeuModelo).all()
        return jsonify({"items": [i.to_dict() for i in items]})
    finally:
        db.close()
```

3. **A migração de banco é automática** — reinicie o servidor.

### Adicionar uma Nova Seção no Frontend

1. **HTML** (`index.html`): adicionar `<section id="meu-modulo" class="page-section">` com cards e tabelas
2. **Navegação** (`index.html`): adicionar `<a data-page="meu-modulo">` no sidebar
3. **JavaScript** (`app.js`): implementar `loadMeuModulo()` e chamar em `navigateTo()`

### Padrão de Sessão de Banco (Template)

```python
@api.route("/endpoint", methods=["POST"])
def minha_rota():
    db = SessionLocal()
    try:
        dados = request.get_json(force=True) or {}
        # ... lógica de negócio
        db.commit()
        return jsonify({"success": True})
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()  # sempre fechar a sessão
```

### Convenções de Código

- **Nomes de rotas**: kebab-case (`/meu-modulo/listar`)
- **Respostas de sucesso**: `{"success": True, ...}`
- **Respostas de erro**: `{"error": "mensagem"}` com HTTP 400/404/500
- **Logs**: sempre chamar `registrar_log(db, tipo, modulo, msg)` em ações importantes
- **Sessões**: usar `SessionLocal()` + `try/finally db.close()`
- **Normalização de dados**: usar `_normalizar_nome()`, `_limpar_cpf()`, `_normalizar_categoria()`

---

*Documentação gerada para o SIPE v2.0 — Sistema Ipê de Planejamento Estratégico*
