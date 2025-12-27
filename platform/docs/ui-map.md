# Mapa de navegação e layout da Web UI

## Navegação principal
- Dashboard: visão geral de topologias, experimentos e execuções em progresso/completas.
- Topologias: lista e inspeção básica de nós/links registrados na API.
- Experimentos: detalhes de cada experimento, tráfego configurado, métricas e runs associados.
- Monitoramento: painel ao vivo por run, métricas em tempo quase real, logs futuros.
- Histórico: tabela com runs passados, status e timestamps.

## Layout
- Header superior com branding e estado da UI.
- Sidebar fixa com navegação (Dashboard, Topologias, Experimentos, Monitoramento, Histórico).
- Área principal exibindo cards, tabelas e visualizações simples (sparklines, chips de links, badges de status).

## Componentes-chave
- Cards de status para contagens e saúde recente.
- Sparklines para séries curtas de métricas.
- Chips para fluxos, links e estados de run.
- Tabela de histórico para runs.
- Grid de nós para topologia (representação leve; pode ser substituída por Cytoscape/vis.js depois).

## Evolução planejada
- Substituir grid de nós por visualização interativa (Cytoscape ou vis.js) com drag & drop.
- WebSocket/SSE para status e métricas em tempo real (polling hoje).
- Ações de start/stop/pause de runs no Monitoramento.
- Formulários de CRUD para topologias/experimentos com validação.
- Modo responsivo mobile-first (atual foca desktop/notebook, mas usa grid fluida).
