# 🚀 Guia de Deploy - NetOps Studio (Uso Acadêmico/Pesquisa)

## 📦 O QUE ENVIAR PARA PRODUÇÃO

### ✅ **ARQUIVOS ESSENCIAIS** (obrigatório)

```
profissa-sdn-framework-1/
├── platform/
│   ├── __init__.py
│   ├── backend/
│   │   ├── __init__.py
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   └── app.py              ← API FastAPI
│   │   ├── core/
│   │   │   ├── metric_catalog.py   ← Catálogo de métricas
│   │   │   ├── metrics.py
│   │   │   ├── netmon_bridge.py
│   │   │   └── *.py                ← Todos os arquivos .py
│   │   ├── plugins/
│   │   │   └── *.py                ← Todos os plugins
│   │   ├── config_loader.py        ← Carrega platform_config.json
│   │   └── schemas.py              ← Modelos Pydantic
│   ├── experiments/
│   │   └── platform_config.json    ← Configuração da topologia
│   └── frontend-next/              ← Build de produção
│       ├── .next/                  ← ⚠️ Gerado pelo build
│       ├── public/
│       ├── src/
│       ├── package.json
│       ├── next.config.mjs
│       └── tsconfig.json
├── scripts/
│   └── desktop_app.py              ← Apenas se usar versão desktop
├── requirements.txt                ← Dependências Python
├── requirements-desktop.txt        ← Apenas para versão desktop
├── VERSION                         ← Versão da aplicação
├── LICENSE                         ← MIT License
└── README.md                       ← Documentação

# NÃO ENVIAR (excluir antes de deploy):
├── .venv/          ← Virtual env (recriar no servidor)
├── __pycache__/    ← Cache Python (gerado automaticamente)
├── node_modules/   ← Dependências Node (npm install no servidor)
├── temp/           ← Dados temporários
├── raw/            ← Dados brutos (recreados em runtime)
├── .next/          ← Build gerado (npm run build no servidor)
├── experiments/    ← Dados de usuário (backup separado)
├── gr-netmon/      ← Opcional (apenas se usar GNU Radio)
├── tests/          ← Opcional (desenvolvimento)
├── desktop/        ← Opcional (apenas para versão desktop)
```

---

## 🎯 **CENÁRIOS DE DEPLOY**

### **Cenário 1: Deploy Web (Mais Comum para Acadêmico)**

#### O que precisa:
```
✅ platform/backend/          # API FastAPI
✅ platform/frontend-next/    # UI Next.js
✅ platform/experiments/platform_config.json
✅ requirements.txt
✅ VERSION
✅ LICENSE
✅ README.md
```

#### O que NÃO precisa:
```
❌ desktop/                   # Só para versão standalone
❌ gr-netmon/                 # Só se coletar métricas reais via GNU Radio
❌ tests/                     # Desenvolvimento
❌ scripts/desktop_app.py     # Só para desktop
❌ temp/, raw/, experiments/  # Gerados em runtime
```

---

### **Cenário 2: Deploy Desktop (Para Demonstrações Offline)**

#### O que precisa:
```
✅ platform/backend/
✅ platform/frontend-next/
✅ desktop/
│   ├── install.sh
│   ├── run_netops.sh
│   ├── netops.desktop
│   └── Instalar NetOps Studio.desktop
✅ scripts/desktop_app.py
✅ requirements.txt
✅ requirements-desktop.txt   # pywebview
✅ VERSION
```

---

## 📋 **CHECKLIST DE DEPLOY**

### **1. Preparar Arquivos (Local)**

```bash
cd /home/jon/profissa-sdn-framework-1

# Limpar arquivos desnecessários
rm -rf .venv __pycache__ temp raw experiments
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null
find . -type d -name "node_modules" -exec rm -rf {} + 2>/dev/null
find . -type d -name ".next" -exec rm -rf {} + 2>/dev/null

# Criar arquivo .gitignore se não existir
cat > .gitignore << 'EOF'
.venv/
venv/
env/
__pycache__/
*.pyc
*.pyo
raw/
temp/
experiments/registry/
experiments/runs/
experiments/run_metrics/
node_modules/
.next/
*.egg-info/
dist/
build/
.DS_Store
EOF
```

### **2. Criar Tarball para Deploy**

```bash
# Opção A: Deploy Web (menor, mais comum)
tar -czf netops-web-deploy.tar.gz \
  platform/backend/ \
  platform/frontend-next/src/ \
  platform/frontend-next/public/ \
  platform/frontend-next/package.json \
  platform/frontend-next/package-lock.json \
  platform/frontend-next/next.config.mjs \
  platform/frontend-next/tsconfig.json \
  platform/frontend-next/tailwind.config.ts \
  platform/frontend-next/postcss.config.mjs \
  platform/frontend-next/.eslintrc.json \
  platform/frontend-next/.env.example \
  platform/experiments/platform_config.json \
  requirements.txt \
  VERSION \
  LICENSE \
  README.md \
  .gitignore

# Opção B: Deploy Desktop (completo)
tar -czf netops-desktop-deploy.tar.gz \
  platform/ \
  desktop/ \
  scripts/desktop_app.py \
  requirements.txt \
  requirements-desktop.txt \
  VERSION \
  LICENSE \
  README.md

# Opção C: Deploy Completo (tudo, exceto arquivos gerados)
tar -czf netops-full-deploy.tar.gz \
  --exclude='.venv' \
  --exclude='__pycache__' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='temp' \
  --exclude='raw' \
  --exclude='experiments/registry' \
  --exclude='experiments/runs' \
  --exclude='experiments/run_metrics' \
  --exclude='*.pyc' \
  --exclude='.git' \
  .

# Verificar tamanho
ls -lh netops-*-deploy.tar.gz
```

**Tamanhos Esperados:**
- Web: ~15-25 MB
- Desktop: ~30-40 MB  
- Completo: ~50-80 MB (com gr-netmon)

---

## 🖥️ **INSTALAÇÃO NO SERVIDOR**

### **Servidor Web (Ubuntu/Debian)**

```bash
# 1. Upload e extração
scp netops-web-deploy.tar.gz user@servidor:/opt/
ssh user@servidor
cd /opt
tar -xzf netops-web-deploy.tar.gz
cd profissa-sdn-framework-1  # ou nome da pasta extraída

# 2. Instalar dependências sistema
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nodejs npm

# 3. Backend Python
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# 4. Frontend Next.js
cd platform/frontend-next
npm ci --production
npm run build
cd ../..

# 5. Variáveis de ambiente
cat > .env << 'EOF'
ENV=production
API_KEY=seu_token_seguro_aqui_min_32_chars
CORS_ALLOW_ORIGINS=https://seu-dominio.com
PLATFORM_CONFIG_PATH=platform/experiments/platform_config.json
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=60
EOF

# 6. Testar
source .venv/bin/activate
uvicorn platform.backend.api.app:app --host 0.0.0.0 --port 8000 &
cd platform/frontend-next && npm start &

# Acessar: http://servidor:3000
```

---

## 🐳 **DEPLOY COM DOCKER (RECOMENDADO)**

### **1. Criar Dockerfile**

```dockerfile
# Dockerfile
FROM python:3.11-slim

# Instalar Node.js
RUN apt-get update && apt-get install -y \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Backend Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Frontend Next.js
COPY platform/frontend-next/package*.json platform/frontend-next/
RUN cd platform/frontend-next && npm ci --production

# Código da aplicação
COPY platform/ platform/
COPY VERSION LICENSE README.md ./

# Build frontend
RUN cd platform/frontend-next && npm run build

# Expor portas
EXPOSE 8000 3000

# Script de inicialização
COPY docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
```

### **2. Criar docker-entrypoint.sh**

```bash
#!/bin/bash
set -e

# Criar diretórios runtime
mkdir -p temp/experiments/{registry,runs,run_metrics}
mkdir -p temp/configs
mkdir -p raw
mkdir -p experiments/{registry,runs,run_metrics}

# Iniciar backend
uvicorn platform.backend.api.app:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Iniciar frontend
cd platform/frontend-next
npm start &
FRONTEND_PID=$!

# Trap SIGTERM
trap "kill $BACKEND_PID $FRONTEND_PID; exit 0" SIGTERM SIGINT

# Aguardar
wait
```

### **3. Criar docker-compose.yml**

```yaml
version: '3.8'

services:
  netops:
    build: .
    ports:
      - "8000:8000"  # Backend API
      - "3000:3000"  # Frontend UI
    environment:
      - ENV=production
      - API_KEY=${API_KEY:-change_me_min_32_chars}
      - CORS_ALLOW_ORIGINS=http://localhost:3000
    volumes:
      - ./experiments:/app/experiments  # Persistir experimentos
      - ./temp:/app/temp                # Persistir configs
      - ./raw:/app/raw                  # Persistir métricas
    restart: unless-stopped

  # Opcional: Nginx reverse proxy
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - netops
    restart: unless-stopped
```

### **4. Deploy Docker**

```bash
# Build e run
docker-compose up -d

# Logs
docker-compose logs -f

# Parar
docker-compose down

# Atualizar
git pull  # ou extrair novo tarball
docker-compose up -d --build
```

---

## 🌐 **DEPLOY EM CLOUD**

### **AWS (EC2 + RDS)**

```bash
# 1. Criar instância EC2 (t2.small ou maior)
# 2. Instalar Docker
sudo yum update -y
sudo yum install -y docker
sudo service docker start
sudo usermod -a -G docker ec2-user

# 3. Upload e deploy
scp -i key.pem netops-web-deploy.tar.gz ec2-user@ip:/home/ec2-user/
ssh -i key.pem ec2-user@ip
tar -xzf netops-web-deploy.tar.gz
cd profissa-sdn-framework-1
docker-compose up -d

# 4. Configurar Security Group
# Liberar portas: 80, 443, 8000 (API), 3000 (Frontend)
```

### **Google Cloud (Cloud Run)**

```bash
# 1. Build e push para GCR
gcloud builds submit --tag gcr.io/PROJECT_ID/netops

# 2. Deploy
gcloud run deploy netops \
  --image gcr.io/PROJECT_ID/netops \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8000

# 3. Frontend separado (Cloud Storage + CDN)
cd platform/frontend-next
npm run build
gsutil -m cp -r .next/static gs://BUCKET_NAME/static
gsutil -m cp -r .next/standalone gs://BUCKET_NAME/
```

### **Heroku**

```bash
# 1. Criar Procfile
cat > Procfile << 'EOF'
web: uvicorn platform.backend.api.app:app --host 0.0.0.0 --port $PORT & cd platform/frontend-next && npm start -- -p 3000
EOF

# 2. Deploy
heroku create netops-app
git push heroku main

# 3. Configurar
heroku config:set ENV=production
heroku config:set API_KEY=seu_token_aqui
```

---

## 📊 **MONITORAMENTO (Produção)**

### **Health Checks**

```bash
# Backend
curl http://localhost:8000/docs  # Swagger UI
curl http://localhost:8000/metrics/definitions

# Frontend
curl http://localhost:3000
```

### **Logs**

```bash
# Docker
docker-compose logs -f netops

# Systemd
journalctl -u netops -f

# Arquivos
tail -f /var/log/netops/*.log
```

---

## 🔒 **SEGURANÇA MÍNIMA (Acadêmico)**

### **1. API Key Forte**

```bash
# Gerar API key segura
openssl rand -hex 32
# Adicionar em .env:
# API_KEY=64_caracteres_aleatorios_aqui
```

### **2. HTTPS com Let's Encrypt**

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d seu-dominio.com
```

### **3. Firewall Básico**

```bash
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

---

## 📦 **BACKUP (Importante para Acadêmico)**

```bash
#!/bin/bash
# backup-netops.sh

BACKUP_DIR="/backups/netops"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup de dados
tar -czf $BACKUP_DIR/experiments_$DATE.tar.gz experiments/
tar -czf $BACKUP_DIR/temp_$DATE.tar.gz temp/
tar -czf $BACKUP_DIR/raw_$DATE.tar.gz raw/

# Manter últimos 7 dias
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completo: $BACKUP_DIR"
```

---

## 🎓 **RESUMO: USO ACADÊMICO/PESQUISA**

### **Deploy Mínimo Funcional:**

```
1. Servidor Ubuntu 20.04+ com 2GB RAM
2. Arquivos necessários:
   - platform/backend/
   - platform/frontend-next/
   - platform/experiments/platform_config.json
   - requirements.txt
   - VERSION

3. Comandos:
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   cd platform/frontend-next && npm ci && npm run build
   uvicorn platform.backend.api.app:app --host 0.0.0.0 &
   npm start &

4. Acesso:
   http://servidor:3000
```

### **Tamanho Total:**
- **Código fonte**: ~20 MB
- **Dependências Python**: ~150 MB
- **Dependências Node**: ~300 MB
- **Build Next.js**: ~80 MB
- **Total em disco**: ~550 MB

### **Requisitos Mínimos:**
- **CPU**: 2 cores
- **RAM**: 2 GB (4 GB recomendado)
- **Disco**: 2 GB (5 GB com experimentos)
- **Rede**: 10 Mbps

---

## ✅ **CHECKLIST FINAL**

Antes de fazer deploy:

- [ ] Executar `npm run build` (frontend) sem erros
- [ ] Testar API localmente (`curl http://localhost:8000/docs`)
- [ ] Configurar API_KEY em .env (produção)
- [ ] Atualizar CORS_ALLOW_ORIGINS (domínio real)
- [ ] Fazer backup de `experiments/` (dados de usuário)
- [ ] Testar health checks
- [ ] Configurar HTTPS (Let's Encrypt)
- [ ] Documentar credenciais (API key, SSH)
- [ ] Configurar backup automático (cron)

---

**Documento criado:** 2026-04-30  
**Versão:** 0.2.0  
**Licença:** MIT  
**Uso:** Acadêmico / Pesquisa
