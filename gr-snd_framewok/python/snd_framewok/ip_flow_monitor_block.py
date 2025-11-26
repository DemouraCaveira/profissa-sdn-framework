"""
IP Flow Monitor Block
Conta fluxos IP, mudanças, timeouts, direções, bytes.
"""
from gnuradio import gr

class IPFlowMonitorBlock(gr.basic_block):
    """
    GNU Radio EPY Block: IP Flow Monitor
    Args:
        iface (str): Interface de rede
    """
    def __init__(self, iface='eth0'):
        gr.basic_block.__init__(self,
            name="IP Flow Monitor Block",
            in_sig=[],
            out_sig=[])
        self.iface = iface

    def start(self):
        # Inicia contagem de fluxos
        pass
