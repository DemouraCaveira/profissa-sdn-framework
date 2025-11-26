"""
Adaptive Routing Trigger Block
Quando SNR cai, dispara evento para o controlador SDN.
"""
from gnuradio import gr

class AdaptiveRoutingTriggerBlock(gr.basic_block):
    """
    GNU Radio EPY Block: Adaptive Routing Trigger
    Args:
        snr_threshold (float): Limite de SNR
    """
    def __init__(self, snr_threshold=10.0):
        gr.basic_block.__init__(self,
            name="Adaptive Routing Trigger Block",
            in_sig=[],
            out_sig=[])
        self.snr_threshold = snr_threshold

    def check_snr(self, snr):
        # Dispara evento se SNR < threshold
        pass
