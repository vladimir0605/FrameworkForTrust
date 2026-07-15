# anchor.py
import os
import json
import logging
from web3 import Web3
from typing import Optional
from web3.middleware import ExtraDataToPOAMiddleware

logger = logging.getLogger("fft.anchor")

# Load ABI once at module startup
_ABI_PATH = os.path.join(os.path.dirname(__file__), "abi", "GeoquadrantAnchor.json")
with open(_ABI_PATH) as f:
    ANCHOR_ABI = json.load(f)

ANCHOR_CONTRACT_ADDRESS = os.getenv("ANCHOR_CONTRACT_ADDRESS", "").strip()
AMOY_RPC_URL = os.getenv("AMOY_RPC_URL", "https://rpc-amoy.polygon.technology")
BACKEND_WALLET_ADDRESS = os.getenv("BACKEND_WALLET_ADDRESS", "").strip()
BACKEND_WALLET_PRIVATE_KEY = os.getenv("BACKEND_WALLET_PRIVATE_KEY", "").strip()


def anchor_cid_onchain(
    token_id: int,
    ipfs_cid: str,
    event_type: str,
) -> Optional[dict]:
    """
    Anchors an IPFS CID on-chain for the given token_id.
    Returns a dict with tx_hash, block_number, timestamp — or None on failure.
    Never raises an exception — errors are logged only.
    """
    if not ANCHOR_CONTRACT_ADDRESS or not Web3.is_address(ANCHOR_CONTRACT_ADDRESS):
        logger.warning("anchor_cid_onchain: ANCHOR_CONTRACT_ADDRESS not set in .env, skipping.")
        return None
    if not BACKEND_WALLET_PRIVATE_KEY:
        logger.warning("anchor_cid_onchain: BACKEND_WALLET_PRIVATE_KEY not set, skipping.")
        return None

    try:
        w3 = Web3(Web3.HTTPProvider(AMOY_RPC_URL))
        w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
        if not w3.is_connected():
            logger.warning("anchor_cid_onchain: Web3 not connected.")
            return None

        contract = w3.eth.contract(
            address=Web3.to_checksum_address(ANCHOR_CONTRACT_ADDRESS),
            abi=ANCHOR_ABI,
        )
        backend = Web3.to_checksum_address(BACKEND_WALLET_ADDRESS)

        tx = contract.functions.anchorCID(
            int(token_id),
            str(ipfs_cid),
            str(event_type),
        ).build_transaction({
            "from":     backend,
            "nonce":    w3.eth.get_transaction_count(backend),
            "gas":      500_000,
            "gasPrice": w3.eth.gas_price,
        })

        signed = w3.eth.account.sign_transaction(tx, BACKEND_WALLET_PRIVATE_KEY)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)

        if receipt.status != 1:
            logger.error("anchor_cid_onchain: TX reverted | tx=%s", tx_hash.hex())
            return None

        block = w3.eth.get_block(receipt["blockNumber"])
        result = {
            "tx_hash":      tx_hash.hex(),
            "block_number": receipt["blockNumber"],
            "timestamp":    block["timestamp"],
            "ipfs_cid":     ipfs_cid,
            "event_type":   event_type,
            "token_id":     token_id,
        }
        logger.info("anchor_cid_onchain: ✅ token=%s cid=%s tx=%s", token_id, ipfs_cid, tx_hash.hex())
        return result

    except Exception as exc:
        logger.error("anchor_cid_onchain: error token=%s cid=%s: %s", token_id, ipfs_cid, exc)
        return None
