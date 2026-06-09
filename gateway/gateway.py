"""
WebSocket ↔ TCP Gateway

Bridges browser WebSocket connections to the C TCP chat server.

Each browser that connects gets a dedicated TCP connection to the C server.
Messages flow in both directions:
  - Browser sends JSON  → gateway strips envelope → forwards raw text over TCP
  - C server sends text → gateway wraps in JSON   → forwards to browser via WS

This is the protocol translation layer. The C server knows nothing about
WebSockets; it just sees TCP clients that happen to be proxied.

Environment variables:
  CHAT_SERVER_HOST  (default: localhost)
  CHAT_SERVER_PORT  (default: 8080)
  WS_PORT           (default: 8765)
"""

import asyncio
import json
import logging
import os

import websockets
from websockets.exceptions import ConnectionClosed

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [gateway] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("gateway")

CHAT_HOST = os.environ.get("CHAT_SERVER_HOST", "localhost")
CHAT_PORT = int(os.environ.get("CHAT_SERVER_PORT", "8080"))
WS_PORT   = int(os.environ.get("WS_PORT", "8765"))


async def handle(websocket):
    """Handle one browser WebSocket connection."""
    peer = websocket.remote_address[0]
    log.info(f"Browser connected: {peer}")

    # Open a dedicated TCP connection to the C server for this browser client
    try:
        reader, writer = await asyncio.open_connection(CHAT_HOST, CHAT_PORT)
    except OSError as exc:
        log.error(f"Cannot reach chat server: {exc}")
        await websocket.close(1011, "Chat server unavailable")
        return

    # Handshake: first WebSocket message must be {"type": "join", "name": "..."}
    try:
        raw = await asyncio.wait_for(websocket.recv(), timeout=15)
        data = json.loads(raw)
        name = str(data.get("name", "")).strip()[:30] or "Anonymous"
    except Exception as exc:
        log.warning(f"Bad handshake from {peer}: {exc}")
        writer.close()
        return

    # Send the name to the C server (it expects name as the first recv)
    writer.write((name + "\n").encode())
    await writer.drain()
    log.info(f"'{name}' joined ({peer})")

    # ── Browser → TCP ──────────────────────────────────────────────────────────
    async def ws_to_tcp():
        try:
            async for raw_msg in websocket:
                try:
                    data = json.loads(raw_msg)
                    if data.get("type") == "chat":
                        text = str(data.get("text", "")).strip()[:900]
                        if text:
                            writer.write((text + "\n").encode())
                            await writer.drain()
                except (json.JSONDecodeError, KeyError):
                    pass  # ignore malformed messages
        except ConnectionClosed:
            pass
        finally:
            writer.close()
            await writer.wait_closed()

    # ── TCP → Browser ──────────────────────────────────────────────────────────
    async def tcp_to_ws():
        try:
            while True:
                line = await reader.readline()
                if not line:
                    break
                text = line.decode(errors="replace").strip()
                if text:
                    await websocket.send(json.dumps({"type": "chat", "text": text}))
        except Exception:
            pass

    # Run both directions concurrently; either side finishing closes the bridge
    await asyncio.gather(ws_to_tcp(), tcp_to_ws())
    log.info(f"'{name}' disconnected")


async def main():
    log.info(f"Gateway ws://0.0.0.0:{WS_PORT}  →  tcp://{CHAT_HOST}:{CHAT_PORT}")
    async with websockets.serve(handle, "0.0.0.0", WS_PORT):
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    asyncio.run(main())
