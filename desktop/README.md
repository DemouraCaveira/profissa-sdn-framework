# Profissa SDN Platform — Desktop App

## Instalação (uma vez só)

```bash
git clone https://github.com/DemouraCaveira/profissa-sdn-framework.git
cd profissa-sdn-framework
bash desktop/install.sh
```

Pronto. O instalador faz **tudo automaticamente**:
- Verifica e instala pacotes do sistema necessários (`python3-gi`, `gir1.2-webkit2-4.0`, etc.)
- Cria o ambiente Python virtual (`.venv`) configurado corretamente
- Instala todas as dependências Python
- Registra o ícone no sistema
- Cria o atalho `.desktop` no menu de aplicativos

## Usar

Procure por **"Profissa SDN Platform"** no menu de aplicativos (ou na barra de favoritos do Ubuntu).

Ou execute direto pelo terminal:
```bash
./desktop/run_profissa.sh
```

## O que acontece ao abrir

1. O backend FastAPI sobe automaticamente na porta **8000**
2. O servidor frontend sobe na porta **5173**
3. A janela da aplicação abre automaticamente

## Diagnóstico (se algo der errado)

O log fica em `/tmp/profissa_app.log`:
```bash
tail -50 /tmp/profissa_app.log
```

## Dependências de sistema (Ubuntu 22.04)

O instalador cuida de tudo, mas caso queira instalar manualmente:
```bash
sudo apt-get install -y python3 python3-venv python3-gi gir1.2-webkit2-4.0
```

## Reinstalar / Atualizar

```bash
bash desktop/install.sh
```
O instalador é idempotente — pode rodar quantas vezes quiser.
