# SIPE | Sistema Ipê de Planejamento Estratégico

SIPE é uma plataforma web moderna de gestão empresarial focada em **Planejamento, Efetivo, Clima, Inventário e Saúde Ocupacional**. Concebida com foco em automação, processamento inteligente de PDF e gestão modular em tempo real.

## 🚀 Principais Features

- **Dashboard Executivo:** Visão em tempo real do número de colaboradores ativos, processamentos de RDO/PTE recentes e visão meteorológica atrelada ao local da obra.
- **Gestão de Efetivo (MOD/MOI):** Importação em lotes de planilhas de Excel (`.xlsx`) com toda a base de Mão de Obra Direta e Mão de Obra Indireta. Autocomplete para adição rápida.
- **Leitura IA de PTE/Cesla:** Motor de processamento via PDF capaz de extrair dinamicamente a força de trabalho que executou os serviços, ler Data/Hora Efetiva exata e realizar auditoria "Fuzzy" (probabilística) de reconhecimento de nomes incorretos extraídos dos PDFs e compará-los milimetricamente com a verdadeira Base de Colaboradores.
- **Histórico Consolidado:** Agrupamento multi-datas da presença dos funcionários com a possibilidade de varrer logs em um modal rico com horários de início e fim.
- **Módulos Independentes (Em expansão):** Arquitetura pronta para acoplar módulos de RH (Administração de Pessoal), Segurança do Trabalho, e Almoxarifado.

## 🛠️ Tecnologias Utilizadas

- **Backend:** Python + Flask
- **Banco de Dados:** SQLite (via SQLAlchemy ORM)
- **Extração de Texto:** PyMuPDF (`fitz`) e Regex
- **Reconhecimento Probabilístico:** `TheFuzz` (Fuzzy Wuzzy)
- **Frontend:** Vanilla HTML/JS/CSS com design Glassmorphism e alta fluidez no DOM.
- **Integração Externa:** OpenWeatherMap API

## ⚙️ Como Instalar e Rodar

1. Clone o repositório:
```bash
git clone https://github.com/brundevs/Sipe---Sistema-Ip-Planejamento-Estrategico.git
cd Sipe---Sistema-Ip-Planejamento-Estrategico
```

2. Instale as dependências:
```bash
pip install -r requirements.txt
```

3. Inicie o servidor:
```bash
python main.py
```

4. Acesse via navegador:
```
http://localhost:5000
```

## 📂 Estrutura de Diretórios
- `app/core/`: Motores de Inteligência e Lógica. Contém `fuzzy_engine.py` e `pdf_extractor.py`.
- `app/database/`: Modelos e sessão relacional.
- `app/web/`: Camada HTTP e Rotas REST da aplicação.
- `app/services/`: Serviços agnósticos e utilitários (ex: Clima, Logs).
- `frontend/`: UI SPA, folhas de estilo e iconografia em SVG SVG-First.
- `main.py`: Entrypoint e Setup do Container.

## 📄 Licença
Sistema Proprietário. Desenvolvido para gestão privada e estratégica.
