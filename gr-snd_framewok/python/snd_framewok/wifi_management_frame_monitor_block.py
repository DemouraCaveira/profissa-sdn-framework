"""
802.11 WiFi Management Frame Monitor
Captura beacons, probe requests, reassociação etc.
"""
from gnuradio import gr

class WiFiManagementFrameMonitorBlock(gr.basic_block):
    """
    GNU Radio EPY Block: WiFi Management Frame Monitor
    Args:
        iface (str): Interface WiFi
    """
    def __init__(self, iface='wlan0'):
        gr.basic_block.__init__(self,
            name="WiFi Management Frame Monitor Block",
            in_sig=[],
            out_sig=[])
        self.iface = iface

    def start(self):
        # Inicia captura de frames de gerenciamento
        pass
