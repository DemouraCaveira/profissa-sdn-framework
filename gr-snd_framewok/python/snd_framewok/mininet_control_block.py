"""
Mininet Control Block (CLI API)
Executa comandos Mininet direto do GNU Radio.
"""
from gnuradio import gr
import subprocess

class MininetControlBlock(gr.basic_block):
    """
    GNU Radio EPY Block: Mininet Control
    Args:
        mininet_path (str): Caminho do binário Mininet
    """
    def __init__(self, mininet_path='mn'):
        gr.basic_block.__init__(self,
            name="Mininet Control Block",
            in_sig=[],
            out_sig=[])
        self.mininet_path = mininet_path

    def run_command(self, cmd):
        # Executa comando Mininet
        pass
