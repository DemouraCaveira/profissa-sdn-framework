"""
ICMP Probe Block (Ping/Jitter/RTT)
Gera pings, mede RTT, jitter, perda.
"""
from gnuradio import gr
import socket
import time

class ICMPProbeBlock(gr.basic_block):
    """
    GNU Radio EPY Block: ICMP Probe
    Args:
        target_ip (str): IP de destino
        interval (float): Intervalo entre pings
    """
    def __init__(self, target_ip='8.8.8.8', interval=1.0):
        gr.basic_block.__init__(self,
            name="ICMP Probe Block",
            in_sig=[],
            out_sig=[])
        self.target_ip = target_ip
        self.interval = interval

    def start(self):
        # Inicia rotina de ping
        pass

    def stop(self):
        # Finaliza rotina
        pass
