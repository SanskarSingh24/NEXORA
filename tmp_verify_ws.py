import asyncio
import json
import websockets

async def main():
    async with websockets.connect('ws://127.0.0.1:8001/ws/map') as ws:
        msg = await asyncio.wait_for(ws.recv(), timeout=3)
        payload = json.loads(msg)
        print(payload['crowd_count'])
        print(payload['risk']['level'])
        print(len(payload['heatmap']))
        print(len(payload['cameras']))
        print(payload['alerts'])

asyncio.run(main())
