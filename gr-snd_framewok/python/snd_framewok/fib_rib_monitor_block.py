"""
FIB/RIB Monitor Block
Lê tabelas de encaminhamento: Linux, OVS, FRR/BGP/OSPF
"""
from gnuradio import gr
import subprocess

class FIBRIBMonitorBlock(gr.basic_block):
    """
    GNU Radio EPY Block: FIB/RIB Monitor
    Args:
        source (str): 'linux', 'ovs', 'frr', etc.
    """
    def __init__(self, source='linux'):
        gr.basic_block.__init__(self,
            name="FIB/RIB Monitor Block",
            in_sig=[],
            out_sig=[])
        self.source = source

    def get_routes(self):
        # Lê tabela de rotas
        pass
