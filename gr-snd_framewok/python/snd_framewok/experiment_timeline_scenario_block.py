"""
Experiment Timeline/Scenario Block
Permite definir cenários: derrubar link, mudar rota, gerar tráfego UDP.
"""
from gnuradio import gr

class ExperimentTimelineScenarioBlock(gr.basic_block):
    """
    GNU Radio EPY Block: Experiment Timeline/Scenario
    Args:
        scenario (list): Lista de eventos
    """
    def __init__(self, scenario=None):
        gr.basic_block.__init__(self,
            name="Experiment Timeline/Scenario Block",
            in_sig=[],
            out_sig=[])
        self.scenario = scenario or []

    def execute_scenario(self):
        # Executa eventos do cenário
        pass
