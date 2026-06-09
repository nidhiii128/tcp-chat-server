# TCP Chat — Full Stack Real-time Chat App

A real-time chat application built from the networking layer up.

```
Browser (React)
     ↕  WebSocket
Python Gateway        ← protocol bridge: WebSocket ↔ raw TCP
     ↕  raw TCP
C Chat Server         ← networking core: POSIX sockets + pthreads
```

The C server handles all chat logic over raw TCP. The Python gateway translates
WebSocket frames from browsers into TCP streams the C server understands.
The React frontend is served by nginx and connects to the gateway.

---

## Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Core server | C, POSIX sockets, pthreads, Linux   |
| Gateway     | Python 3.12, asyncio, websockets    |
| Frontend    | React 18, Vite                      |
| Serving     | nginx                               |
| Containers  | Docker, Docker Compose              |

---

## Run locally (Docker — recommended)

```bash
git clone https://github.com/<you>/tcp-chat-app.git
cd tcp-chat-app

docker compose up --build
```

Open http://localhost:3000 in multiple browser tabs and start chatting.

---

## Run locally (without Docker)

**1. Build and start the C server**
```bash
cd server
make
./server 8080
```

**2. Start the Python gateway** (in a new terminal)
```bash
cd gateway
pip install -r requirements.txt
CHAT_SERVER_HOST=localhost CHAT_SERVER_PORT=8080 python gateway.py
```

**3. Start the React dev server** (in a new terminal)
```bash
cd frontend
npm install
VITE_WS_URL=ws://localhost:8765 npm run dev
```

Open http://localhost:5173

---

## Deploy to a Linux VPS (DigitalOcean / Hetzner / any Ubuntu server)

**1. SSH into your server and install Docker**
```bash
curl -fsSL https://get.docker.com | sh
```

**2. Clone the repo**
```bash
git clone https://github.com/<you>/tcp-chat-app.git
cd tcp-chat-app
```

**3. Edit docker-compose.yml — set your server's public IP**

Change the `VITE_WS_URL` build arg:
```yaml
args:
  VITE_WS_URL: "ws://YOUR_SERVER_IP:8765"
```

**4. Start**
```bash
docker compose up -d --build
```

Your app will be live at `http://YOUR_SERVER_IP:3000`.

Open ports 3000 (HTTP) and 8765 (WebSocket) in your firewall:
```bash
ufw allow 3000
ufw allow 8765
```

---

## Project structure

```
tcp-chat-app/
├── server/
│   ├── server.c          TCP server — socket lifecycle, threading, broadcast
│   ├── Makefile
│   └── Dockerfile
├── gateway/
│   ├── gateway.py        WebSocket ↔ TCP bridge (asyncio)
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx       Join screen + chat UI
│   │   └── index.css
│   ├── nginx.conf
│   ├── package.json
│   ├── vite.config.js
│   └── Dockerfile        Multi-stage: Vite build → nginx
├── docker-compose.yml
└── .gitignore
```

---

## Git setup

```bash
cd tcp-chat-app
git init
git add .
git commit -m "Initial commit: full-stack TCP chat (C + Python + React + Docker)"

# Create repo on GitHub, then:
git remote add origin https://github.com/<you>/tcp-chat-app.git
git branch -M main
git push -u origin main
```

---

## How to explain this in an interview

- "The C server owns the networking layer — raw socket lifecycle, accept loop, thread-per-client, mutex-protected broadcast."
- "Browsers can't speak raw TCP, so I wrote a Python asyncio gateway that translates WebSocket frames to TCP streams and back."
- "The three services are containerized independently and orchestrated with Docker Compose — the server is not exposed externally, only the gateway is."
- "Deployed to a Linux VPS by changing one env variable and running docker compose up."
