# Toggle de Dados Sintéticos vs Reais - NetOps Studio

## 📍 O que foi implementado

### Backend API (`platform/backend/api/app.py`)

#### 1. **Variável global de configuração do sistema**
```python
system_settings: Dict[str, Any] = {
    "use_real_data": real_collection_default,  # Ativa/desativa coleta real
    "auto_collect_enabled": False,
    "collect_interval_sec": collection_interval_seconds,
}
```

#### 2. **Endpoint GET `/system/settings`**
Retorna as configurações atuais:
```json
{
  "use_real_data": false,
  "auto_collect_enabled": false,
  "collect_interval_sec": 5.0,
  "real_collection_available": true
}
```

#### 3. **Endpoint PATCH `/system/settings`**
Atualiza configurações em runtime:
```bash
curl -X PATCH http://localhost:8000/system/settings \
  -H "Content-Type: application/json" \
  -d '{"use_real_data": true}'
```

#### 4. **Integração com coleta automática**
Todas as funções de coleta agora consultam `system_settings["use_real_data"]`:
- `start_run()` → Experimentos respeitam o modo global
- `/metrics/collect` → POST manual respeita o modo
- `_auto_collect_loop()` → Background loop respeita o modo

### Frontend (`platform/frontend-next/src/features/settings/`)

#### 1. **Componente `DataModeToggle.tsx`**
Interface visual com:
- **Toggle principal**: Alterna entre Sintético 🟢 (padrão) e Real 🔴
- **Indicadores visuais**: Badges coloridos (verde = demonstração, vermelho = produção)
- **Aviso de requisitos**: Lista o que é necessário para coleta real funcionar
- **Controle de intervalo**: Input numérico para ajustar `collect_interval_sec`
- **Documentação inline**: Explica a diferença entre os dois modos

#### 2. **Integração no `SettingsView.tsx`**
O toggle aparece na **primeira seção da tab "general"**, antes das configurações de orquestração.

---

## 🎯 Como usar

### Para o Pesquisador (Usuário Final)

1. **Acesse Configurações** → Menu lateral → "Configurações"
2. **Na tab "General"**, veja o card "Modo de Coleta de Dados"
3. **Escolha o modo**:
   - **🟢 Dados SINTÉTICOS**: Para testes, demos, desenvolvimento
   - **🔴 Dados REAIS**: Para experimentos de produção com infraestrutura real

### Diferença entre os modos

| Aspecto | Sintético | Real |
|---------|-----------|------|
| **Dados** | Aleatórios gerados | Coletados da rede |
| **Infraestrutura** | Não necessária | Docker/Mininet obrigatório |
| **Latência** | Instantâneo | Dependente da rede |
| **Uso** | Demos, testes, prototipação | Pesquisa, produção, papers |
| **Disponibilidade** | 100% sempre | Requer ambiente configurado |

---

## 🔧 Detalhes Técnicos

### Modo Sintético (Padrão)
```python
def _collect_synthetic_full(topology, labels):
    # Gera valores aleatórios para todas as métricas
    samples.append(_mk("latency_ms", "network", node.id, 
                      round(random.uniform(0.2, 8.0), 3)))
    samples.append(_mk("packet_loss_pct", "network", node.id, 
                      round(random.uniform(0, 3.0), 3)))
    # ... +600 métricas nas 10 camadas OSI
```

**Vantagens:**
- ✅ Funciona sem Docker/Mininet
- ✅ Latência zero (instantâneo)
- ✅ Cobertura completa (todas as 600+ métricas)
- ✅ Ideal para UI/UX testing

**Desvantagens:**
- ❌ Dados não refletem realidade
- ❌ Não serve para validação científica

### Modo Real
```python
def _collect_real(topology, labels):
    # Executa comandos reais nos containers
    ping_output = _run_cmd(["docker", "exec", container, 
                            "ping", "-c", "3", target.mgmt_ip])
    ss_output = _run_cmd(["docker", "exec", container, "ss", "-s"])
    flows = _run_cmd(["docker", "exec", container, 
                      "ovs-ofctl", "dump-flows", "br-s1"])
    # Parse output e retorna métricas reais
```

**Vantagens:**
- ✅ Dados verdadeiros da rede
- ✅ Validação científica
- ✅ Detecta problemas reais
- ✅ Apto para publicação

**Desvantagens:**
- ❌ Requer Docker + Mininet + OpenFlow
- ❌ Latência de execução (ping, ss, ovs-ofctl)
- ❌ Cobertura parcial (apenas métricas disponíveis)
- ❌ Pode falhar se infraestrutura não estiver up

---

## 🚀 Requisitos para Modo Real

### 1. **Topologia Docker configurada**
```json
{
  "nodes": [
    {
      "id": "h1",
      "role": "host",
      "mgmt_ip": "172.20.0.12",
      "container_name": "h1",
      "image": "alexandremitsurukaihara/lst2.0:host"
    }
  ]
}
```

### 2. **Containers rodando**
```bash
docker ps | grep -E "h1|h2|s1|c1"
# Deve retornar containers ativos
```

### 3. **Acesso Docker exec**
```bash
docker exec h1 ping -c 1 172.20.0.13  # Deve funcionar
docker exec s1 ovs-ofctl dump-flows br-s1  # Deve funcionar
```

### 4. **OpenFlow ativo (opcional para control/dataplane)**
```bash
docker exec s1 ovs-vsctl show
# Deve mostrar conexão com controller
```

---

## 🔬 Casos de Uso

### Cenário 1: Desenvolvimento da UI
```
Modo: 🟢 SINTÉTICO
Motivo: Testar interface sem infraestrutura
Resultado: Todas as métricas aparecem instantaneamente
```

### Cenário 2: Demo em Conferência
```
Modo: 🟢 SINTÉTICO
Motivo: Apresentação sem depender de rede
Resultado: Dashboard sempre funcional
```

### Cenário 3: Experimento para Paper
```
Modo: 🔴 REAL
Motivo: Dados científicos validáveis
Resultado: Métricas reais coletadas da topologia
```

### Cenário 4: Debugging de Topologia
```
Modo: 🔴 REAL
Motivo: Diagnosticar problemas de rede
Resultado: Latência real, loss real, flows reais
```

---

## 📊 API de Exemplo

### Verificar modo atual
```bash
curl http://localhost:8000/system/settings
```

**Resposta:**
```json
{
  "use_real_data": false,
  "auto_collect_enabled": false,
  "collect_interval_sec": 5.0,
  "real_collection_available": true
}
```

### Ativar modo real
```bash
curl -X PATCH http://localhost:8000/system/settings \
  -H "Content-Type: application/json" \
  -d '{"use_real_data": true}'
```

### Ajustar intervalo de coleta
```bash
curl -X PATCH http://localhost:8000/system/settings \
  -H "Content-Type: application/json" \
  -d '{"collect_interval_sec": 10}'
```

### Executar experimento com modo específico
```bash
# Forçar sintético (ignora configuração global)
curl -X POST http://localhost:8000/experiments/exp_123/runs?mode=synthetic

# Forçar real (ignora configuração global)
curl -X POST http://localhost:8000/experiments/exp_123/runs?mode=real

# Usar configuração global (padrão)
curl -X POST http://localhost:8000/experiments/exp_123/runs
```

---

## 🎨 Interface Visual

### Estado: Sintético (Padrão)
```
╔════════════════════════════════════════════════╗
║ Modo de Coleta de Dados   [Coleta Real Disponível] ║
╠════════════════════════════════════════════════╣
║                                                ║
║ 🟢 Dados SINTÉTICOS  [DEMONSTRAÇÃO]            ║
║ Gerando dados sintéticos aleatórios para      ║
║ demonstração/testes.                           ║
║ Ideal para desenvolvimento, demos e testes     ║
║ sem infraestrutura real.                       ║
║                                  [Real →]      ║
║                                                ║
║ Intervalo de Auto-Coleta: 5s  [5 ▾]          ║
║                                                ║
║ 📘 Como funciona                               ║
║ Sintético: Gera valores aleatórios...         ║
║ Real: Executa comandos como ping, ss, ovs...  ║
╚════════════════════════════════════════════════╝
```

### Estado: Real (Produção)
```
╔════════════════════════════════════════════════╗
║ Modo de Coleta de Dados   [Coleta Real Disponível] ║
╠════════════════════════════════════════════════╣
║                                                ║
║ 🔴 Dados REAIS  [PRODUÇÃO]                     ║
║ Coletando métricas REAIS via Docker,          ║
║ Mininet, OpenFlow, etc.                        ║
║ Experimentos usarão dados reais da            ║
║ infraestrutura configurada.                    ║
║                              [← Sintético]     ║
║                                                ║
║ ⚠️ Requisitos para Coleta Real                ║
║ • Containers Docker com nós da topologia      ║
║ • Acesso SSH ou Docker exec                   ║
║ • OpenFlow ativo (control/dataplane)          ║
║ • Variáveis de ambiente configuradas          ║
║                                                ║
║ Intervalo de Auto-Coleta: 5s  [5 ▾]          ║
╚════════════════════════════════════════════════╝
```

---

## 🐛 Troubleshooting

### Problema: "Coleta real retorna 0 métricas"
**Solução:**
1. Verificar se containers estão rodando: `docker ps`
2. Testar comando manual: `docker exec h1 ping -c 1 172.20.0.13`
3. Verificar `platform_config.json`: `mgmt_ip`, `container_name` corretos
4. Verificar logs: Backend mostra "Modo de coleta alterado: REAL"

### Problema: "Toggle não aparece na interface"
**Solução:**
1. Build do frontend: `cd platform/frontend-next && npm run build`
2. Verificar console do navegador (F12) → Erros de API
3. Verificar backend rodando: `curl http://localhost:8000/system/settings`

### Problema: "Erro 404 ao chamar /system/settings"
**Solução:**
1. Backend desatualizado → Reiniciar: `uvicorn platform.backend.api.app:app`
2. Verificar se arquivo `app.py` tem os novos endpoints

---

## 📝 Logs

### Backend mostra modo ativo
```
INFO: Modo de coleta alterado: SINTÉTICO
INFO: Auto-coleta: ATIVADA
INFO: Intervalo de coleta: 5.0s
```

### Experimento mostra modo usado
```json
{
  "run_id": "run_abc123",
  "status": "COMPLETED",
  "logs": [
    "2026-04-29T10:00:00 metrics_collected:842",
    "2026-04-29T10:00:00 mode:synthetic"
  ]
}
```

---

## 🎯 Próximos Passos (Opcional)

### Melhorias Futuras
1. **Persistir configuração** → Salvar em banco (atualmente in-memory)
2. **Modo híbrido** → Sintético + Real (fallback automático)
3. **Health check** → Testar infraestrutura antes de ativar modo real
4. **Métricas de coleta** → Dashboard mostrando taxa de sucesso/falha
5. **Cache de amostras** → Redis para otimizar consultas

---

**Criado:** 2026-04-29  
**Versão:** 0.2.0  
**Autor:** NetOps Studio Team  
**Licença:** MIT
