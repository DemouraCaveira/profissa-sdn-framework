"""
OVS Flow Table Monitor Block
Monitora ovs-ofctl dump-flows com delta de mudanças.
"""
from gnuradio import gr
import subprocess

class OVSFlowTableMonitorBlock(gr.basic_block):
    """
    GNU Radio EPY Block: OVS Flow Table Monitor
    Args:
        bridge (str): Nome da bridge OVS
    """
    def __init__(self, bridge='br0'):
        gr.basic_block.__init__(self,
            name="OVS Flow Table Monitor Block",
            in_sig=[],
            out_sig=[])
        self.bridge = bridge

    def start(self):
        # Monitora tabela de fluxos OVS
        pass
