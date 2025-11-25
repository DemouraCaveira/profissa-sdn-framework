#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import dash
from dash import dcc, html, dash_table
from dash.dependencies import Input, Output
import plotly.express as px
import pandas as pd
import os

# Caminho do CSV
CSV_PATH = "/home/jon/profissa-sdn-framework/raw/sdn_monitor.csv"

# Inicializa app Dash
app = dash.Dash(__name__, suppress_callback_exceptions=True)
app.title = "SDN Monitoring Dashboard"

# Layout com abas
app.layout = html.Div([
    html.H1("SDN Monitoring Dashboard", style={"textAlign": "center"}),
    dcc.Tabs(id="tabs", value="latency", children=[
        dcc.Tab(label="Latência/Jitter/Perda", value="latency"),
        dcc.Tab(label="Throughput", value="throughput"),
        dcc.Tab(label="Captura de Pacotes", value="capture"),
        dcc.Tab(label="Métricas de Sistema", value="system"),
        dcc.Tab(label="Tabela Completa", value="table"),
    ]),
    html.Div(id="tabs-content"),
    dcc.Interval(id="interval", interval=5000, n_intervals=0)  # atualiza a cada 5s
])

# Função para carregar CSV
def load_data():
    if os.path.exists(CSV_PATH):
        df = pd.read_csv(CSV_PATH)
        return df
    return pd.DataFrame(columns=["timestamp","node","layer","metric","value","details_json"])

# Callback para atualizar conteúdo das abas
@app.callback(Output("tabs-content", "children"),
              Input("tabs", "value"),
              Input("interval", "n_intervals"))
def update_tab(tab, n):
    df = load_data()
    if df.empty:
        return html.Div("Nenhum dado disponível ainda.")

    if tab == "latency":
        # Filtra métricas ICMP/TCP/UDP
        filt = df[df["metric"].str.contains("icmp|tcp|udp", case=False)]
        fig = px.line(filt, x="timestamp", y="value", color="node",
                      facet_row="metric", title="Latência/Jitter/Perda por Nó")
        return dcc.Graph(figure=fig)

    elif tab == "throughput":
        filt = df[df["metric"].str.contains("throughput", case=False)]
        fig = px.line(filt, x="timestamp", y="value", color="node",
                      facet_row="metric", title="Throughput entre Hosts")
        return dcc.Graph(figure=fig)

    elif tab == "capture":
        filt = df[df["metric"].str.contains("packet_counts", case=False)]
        fig = px.bar(filt, x="timestamp", y="value", color="node",
                     title="Estatísticas de Captura de Pacotes")
        return dcc.Graph(figure=fig)

    elif tab == "system":
        filt = df[df["node"]=="system"]
        fig = px.line(filt, x="timestamp", y="value", color="metric",
                      title="Métricas de Sistema (CPU, Memória, Rede)")
        return dcc.Graph(figure=fig)

    elif tab == "table":
        return dash_table.DataTable(
            data=df.to_dict("records"),
            columns=[{"name": i, "id": i} for i in df.columns],
            page_size=15,
            style_table={"overflowX": "auto"},
            style_cell={"textAlign": "left"}
        )

    return html.Div("Selecione uma aba.")

# Executa servidor
if __name__ == "__main__":
    app.run_server(host="0.0.0.0", port=8050, debug=True)
