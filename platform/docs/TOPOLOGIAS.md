# 📡 Topologias no NetOps Studio

## Visão Geral

O NetOps Studio suporta topologias de rede SDN definidas em **JSON** que descrevem:
- **Nós** (hosts, switches, controladores)
- **Links** (conexões com largura de banda, latência, perda)
- **Fluxos OpenFlow** (regras de encaminhamento)
- **Perfis de tráfego** (ping, iperf, tráfego customizado)
- **Métricas** (coleta em múltiplas camadas OSI)

## 🎯 Formas de Configurar Topologia

### 1. **Via Interface Web (Editor Visual)**

**Localização:** `/topologia` no frontend Next.js

**Recursos:**
- Arrastar e soltar nós (hosts, switches, controladores)
- Criar links físicos e lógicos
- Visualizar em modo **físico** ou **lógico**
- Configurar IPs, MACs, DPIDs
- Traçar rotas entre hosts
- Capturar snapshots da topologia
- Sincronização automática com backend via API REST

**Tipos de Nó Suportados:**
```typescript
type NodeKind = "switch" | "host" | "controller";
```

**Exemplo de Nó (Switch):**
```json
{
  "id": "s1",
  "type": "switch",
  "mgmt_ip": "172.20.0.11",
  "meta": {
    "dpid": "0000000000000001",
    "position": { "x": 400, "y": 300 }
  }
}
```

**Exemplo de Link:**
```json
{
  "source": "s1",
  "target": "h1",
  "bandwidth_mbps": 1000,
  "delay_ms": 1,
  "loss_pct": 0.0
}
```

---

### 2. **Via Arquivo JSON (`platform_config.json`)**

**Localização:** `platform/experiments/platform_config.json`

**Estrutura Completa:**

```json
{
  "environment": {
    "mode": "docker",
    "docker_network": "sdn_lab_net"
  },
  "controllers": [
    {
      "id": "ctrl-ryu",
      "type": "ryu",
      "api_base_url": "http://127.0.0.1:8080",
      "openflow": { "host": "127.0.0.1", "port": 6633 }
    }
  ],
  "default_controller": "ctrl-ryu",
  "nodes": [
    {
      "id": "c1",
      "role": "controller",
      "mgmt_ip": "172.20.0.10",
      "image": "alexandremitsurukaihara/lst2.0:ryucontroller",
      "container_name": "c1"
    },
    {
      "id": "s1",
      "role": "switch",
      "type": "ovs",
      "mgmt_ip": "172.20.0.11",
      "datapath_id": "0000000000000001",
      "bridge": "br-s1",
      "container_name": "s1"
    },
    {
      "id": "h1",
      "role": "host",
      "mgmt_ip": "172.20.0.12",
      "image": "alexandremitsurukaihara/lst2.0:host",
      "container_name": "h1"
    }
  ],
  "links": [
    { "source": "s1", "target": "h1", "bandwidth_mbps": 1000 }
  ]
}
```

**Validação Automática:**
- Controladores devem ter `type` em `["ryu", "onos", "odl", "floodlight"]`
- Nós devem ter `role` em `["host", "switch", "controller"]`
- IDs devem ser únicos

---

### 3. **Via API REST**

**Endpoint:** `POST /topologies`

**Payload:**
```json
{
  "name": "Topologia Linear",
  "controller": "ctrl-ryu",
  "nodes": [
    { "id": "s1", "type": "switch", "mgmt_ip": "172.20.0.11", "meta": {} },
    { "id": "h1", "type": "host", "mgmt_ip": "172.20.0.12", "meta": {} }
  ],
  "links": [
    { "source": "s1", "target": "h1", "bandwidth_mbps": 1000 }
  ]
}
```

**Outros Endpoints:**
- `GET /topologies` → listar todas
- `GET /topologies/{id}` → obter uma específica
- `PUT /topologies/{id}` → atualizar
- `DELETE /topologies/{id}` → remover

---

## 🏗️ Topologias Comuns Suportadas

### 1. **Linear (Single Switch)**
```
h1 --- s1 --- h2
```
**Caso de Uso:** Teste básico de conectividade, latência, throughput

---

### 2. **Star (Hub Central)**
```
    h1
     |
h2--s1--h3
     |
    h4
```
**Caso de Uso:** Teste de balanceamento, congestionamento central

---

### 3. **Tree (Hierárquica)**
```
        c1
        |
       s1
      /  \
    s2    s3
   / \    / \
  h1 h2  h3 h4
```
**Caso de Uso:** Data center, agregação de switches

---

### 4. **Mesh (Múltiplos Caminhos)**
```
s1 --- s2
|  \  /  |
|   \/   |
|   /\   |
|  /  \  |
s3 --- s4
```
**Caso de Uso:** Resiliência, failover, load balancing

---

### 5. **Linear Multi-Switch**
```
h1 --- s1 --- s2 --- s3 --- h2
```
**Caso de Uso:** Latência multi-hop, roteamento OpenFlow

---

## 🔧 Campos Suportados

### **Nós (TopologyNode)**
```typescript
{
  id: string;              // Obrigatório, único
  type: "host" | "switch" | "controller";
  mgmt_ip?: string;        // IP de gerenciamento
  image?: string;          // Imagem Docker
  meta: {
    container_name?: string;
    dpid?: string;         // Datapath ID (switches)
    bridge?: string;       // Nome da bridge OVS
    ssh_user?: string;
    ssh_port?: number;
    position?: { x: number; y: number };  // Para editor visual
  }
}
```

### **Links (TopologyLink)**
```typescript
{
  source: string;          // ID do nó origem
  target: string;          // ID do nó destino
  bandwidth_mbps?: number; // Largura de banda (Mbps)
  delay_ms?: number;       // Latência (ms)
  loss_pct?: number;       // Perda de pacotes (0-100%)
  meta?: {
    capacityMbps?: number; // Alias para bandwidth_mbps
    lossPct?: number;      // Alias para loss_pct
  }
}
```

---

## 🎨 Editor Visual (Frontend)

**Localização:** `platform/frontend-next/src/features/topology/TopologyEditor.tsx`

**Modos de Visualização:**
- **Físico:** mostra topologia real (switches, hosts, links diretos)
- **Lógico:** mostra conectividade L3+ (rotas, flows ativos)

**Cenários Pré-configurados:**
1. **Base:** topologia padrão limpa
2. **All OK:** todos os links funcionando
3. **Degraded:** alguns links com perda/latência alta
4. **Down:** links offline simulados
5. **Trace:** rastreamento de rota entre hosts

**Snapshots:**
- Captura estado atual da topologia
- Compara diferenças (nós/links adicionados/removidos)
- Salva no `localStorage`

---

## 🔌 Integração com Mininet/Docker

**Runner:** `platform/backend/plugins/mininet_runner.py`

**Controladores Suportados:**
- **Ryu** (padrão)
- **ONOS**
- **OpenDaylight (ODL)**
- **Floodlight**

**Formato de Container:**
```json
{
  "id": "h1",
  "role": "host",
  "container_name": "h1",
  "image": "alexandremitsurukaihara/lst2.0:host",
  "mgmt_ip": "172.20.0.12"
}
```

**Requisitos:**
- Containers devem estar na mesma rede Docker (`docker_network`)
- Switches OVS conectados ao controlador via OpenFlow
- Imagens devem ter SSH habilitado para coleta de métricas

---

## 📊 Métricas por Camada

A topologia habilita coleta em múltiplas camadas:

```json
{
  "metric_layers": {
    "physical": true,    // L1: erros, descartes, potência ótica
    "link": true,        // L2: utilização, VLAN, queues
    "network": true,     // L3: latência ICMP, rotas, ARP
    "transport": true,   // L4: RTT TCP, jitter UDP
    "application": true, // L7: HTTP, DNS, tempo de resposta
    "control": true,     // Control Plane: saúde do controlador
    "dataplane": true    // Data Plane: flows OpenFlow, counters
  }
}
```

**Métricas Coletadas Automaticamente:**
- `if_link_up` (L0)
- `if_rx_mbps`, `if_tx_mbps` (L1)
- `latency_ms` (L3)
- `packet_loss_pct` (L3)
- `throughput_mbps` (L4)
- `openflow_flow_count` (Dataplane)

---

## 🚀 Workflow Típico

### 1. **Criar Topologia**
- Via editor visual OU
- Editar `platform_config.json`

### 2. **Salvar/Sincronizar**
- Clicar "Salvar no Backend" (editor) OU
- Reiniciar backend (lê `platform_config.json` no boot)

### 3. **Associar a Experimento**
```json
{
  "topology_id": "topo-abc123",
  "traffic": [
    { "generator": "ping", "src": "h1", "dst": "h2" }
  ],
  "metrics": {
    "metrics": ["latency_ms", "packet_loss_pct"],
    "interval_sec": 5.0
  }
}
```

### 4. **Executar Experimento**
- Backend provisiona topologia via Mininet/Docker
- Coleta métricas em tempo real
- Armazena em `temp/experiments/runs/`

### 5. **Visualizar Resultados**
- Dashboard mostra métricas por camada
- Gráficos de séries temporais
- Comparação entre runs

---

## 🔀 Fluxos OpenFlow

**Configuração em `platform_config.json`:**
```json
{
  "flow_templates": [
    {
      "name": "h1_to_h2",
      "controller": "ctrl-ryu",
      "match": { "in_port": "1", "eth_type": "0x0800" },
      "actions": { "output": "2" },
      "priority": 100
    }
  ]
}
```

**API REST:**
- `GET /flows?topology_id={id}` → listar flows de uma topologia
- `POST /flows` → criar novo flow
- `DELETE /flows/{id}` → remover flow

---

## ✅ Boas Práticas

1. **IDs Únicos:** use prefixos (`h1`, `s1`, `ctrl-1`)
2. **IPs de Gerenciamento:** sempre configure `mgmt_ip` para coleta remota
3. **Largura de Banda:** defina `bandwidth_mbps` para simulações realistas
4. **Latência/Perda:** útil para testes de degradação
5. **Metadata:** use `meta` para armazenar info customizada (posição, tags)
6. **Snapshots:** capture estado antes de mudanças críticas
7. **Validação:** API rejeita topologias inválidas (IDs duplicados, tipos errados)

---

## 🧪 Exemplos Práticos

### Exemplo 1: Topologia Mínima (1 Switch, 2 Hosts)
```json
{
  "name": "Topologia Mínima",
  "nodes": [
    { "id": "s1", "type": "switch", "mgmt_ip": "172.20.0.11", "meta": {} },
    { "id": "h1", "type": "host", "mgmt_ip": "172.20.0.12", "meta": {} },
    { "id": "h2", "type": "host", "mgmt_ip": "172.20.0.13", "meta": {} }
  ],
  "links": [
    { "source": "s1", "target": "h1", "bandwidth_mbps": 100 },
    { "source": "s1", "target": "h2", "bandwidth_mbps": 100 }
  ]
}
```

### Exemplo 2: Tree com Controlador
```json
{
  "name": "Tree 2 Níveis",
  "controller": "ctrl-ryu",
  "nodes": [
    { "id": "ctrl", "type": "controller", "mgmt_ip": "172.20.0.10", "meta": {} },
    { "id": "s1", "type": "switch", "mgmt_ip": "172.20.0.11", "meta": {} },
    { "id": "s2", "type": "switch", "mgmt_ip": "172.20.0.12", "meta": {} },
    { "id": "h1", "type": "host", "mgmt_ip": "172.20.0.21", "meta": {} },
    { "id": "h2", "type": "host", "mgmt_ip": "172.20.0.22", "meta": {} }
  ],
  "links": [
    { "source": "ctrl", "target": "s1" },
    { "source": "s1", "target": "s2", "bandwidth_mbps": 1000 },
    { "source": "s2", "target": "h1", "bandwidth_mbps": 100 },
    { "source": "s2", "target": "h2", "bandwidth_mbps": 100 }
  ]
}
```

### Exemplo 3: Link com Perda/Latência
```json
{
  "source": "s1",
  "target": "s2",
  "bandwidth_mbps": 100,
  "delay_ms": 50,
  "loss_pct": 2.5
}
```

---

## 🛠️ Troubleshooting

**Problema:** Topologia não aparece no editor visual
- ✅ Verifique se foi sincronizada via "Salvar no Backend"
- ✅ Confirme que backend está rodando (`GET /topologies`)

**Problema:** Métricas não são coletadas
- ✅ Configure `mgmt_ip` nos nós
- ✅ Verifique se `metric_layers` está habilitado no config
- ✅ Containers devem estar acessíveis via SSH

**Problema:** Fluxos OpenFlow não funcionam
- ✅ Controlador deve estar em `controllers` no config
- ✅ Switches devem ter `datapath_id` único
- ✅ Porta OpenFlow (6633/6653) deve estar aberta

---

## 📚 Referências

- **Schemas:** `platform/backend/schemas.py`
- **Config Loader:** `platform/backend/config_loader.py`
- **API REST:** `platform/backend/api/app.py` (linhas 1127+)
- **Editor Visual:** `platform/frontend-next/src/features/topology/TopologyEditor.tsx`
- **Exemplo Real:** `platform/experiments/platform_config.json`

---

## 🎯 Resumo

| Método | Uso | Formato | Persistência |
|--------|-----|---------|--------------|
| **Editor Visual** | Prototipagem rápida | UI drag-and-drop | API REST |
| **`platform_config.json`** | Produção, CI/CD | JSON | Arquivo |
| **API REST** | Integração programática | JSON | Em memória* |

_*Use banco de dados para persistência real (futuro)._

---

**NetOps Studio** — Network Operations & Monitoring Platform
