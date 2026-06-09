import { useState, useEffect, useRef, useCallback } from "react";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8765";

// ── helpers ──────────────────────────────────────────────────────────────────

function classify(text, myName) {
  if (text.startsWith("***")) return "system";
  if (text.startsWith(`[${myName}]`)) return "mine";
  return "theirs";
}

// ── components ───────────────────────────────────────────────────────────────

function Message({ text, kind }) {
  // Strip the [Name] prefix for "mine" messages so it looks cleaner
  const display = kind === "mine" ? text.replace(/^\[[^\]]+\]\s*/, "") : text;
  return <div className={`msg ${kind}`}>{display}</div>;
}

function StatusDot({ status }) {
  const label = { connected: "online", connecting: "connecting…", disconnected: "offline", error: "error" }[status] || status;
  return <span className={`dot ${status}`}>{label}</span>;
}

// ── screens ──────────────────────────────────────────────────────────────────

function JoinScreen({ onJoin, error }) {
  const [name, setName] = useState("");
  return (
    <div className="join-wrap">
      <div className="join-card">
        <div className="logo">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <h1>TCP Chat</h1>
        <p className="subtitle">Built on raw POSIX sockets in C</p>
        <input
          type="text"
          placeholder="Your display name"
          value={name}
          maxLength={30}
          autoFocus
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && name.trim() && onJoin(name.trim())}
        />
        <button
          onClick={() => name.trim() && onJoin(name.trim())}
          disabled={!name.trim()}
        >
          Join Chat
        </button>
        {error && <p className="err">{error}</p>}
        <p className="tech-note">WebSocket → Python gateway → TCP → C server</p>
      </div>
    </div>
  );
}

function ChatScreen({ myName, messages, status, onSend, onLeave }) {
  const [input, setInput] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput("");
  }

  return (
    <div className="chat-wrap">
      <header>
        <div className="header-left">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span>TCP Chat</span>
        </div>
        <div className="header-right">
          <StatusDot status={status} />
          <span className="my-name">You: {myName}</span>
          <button className="leave-btn" onClick={onLeave}>Leave</button>
        </div>
      </header>

      <div className="messages">
        {messages.length === 0 && (
          <p className="empty">No messages yet. Say something!</p>
        )}
        {messages.map(m => (
          <Message key={m.id} text={m.text} kind={classify(m.text, myName)} />
        ))}
        <div ref={bottomRef} />
      </div>

      <form className="input-bar" onSubmit={handleSend}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type a message…"
          autoFocus
          disabled={status !== "connected"}
        />
        <button type="submit" disabled={!input.trim() || status !== "connected"}>
          Send
        </button>
      </form>
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen]   = useState("join");
  const [myName, setMyName]   = useState("");
  const [messages, setMessages] = useState([]);
  const [status, setStatus]   = useState("disconnected");
  const [joinErr, setJoinErr] = useState("");
  const wsRef = useRef(null);

  const addMsg = useCallback((text) => {
    setMessages(prev => [...prev, { text, id: crypto.randomUUID() }]);
  }, []);

  function connect(name) {
    setJoinErr("");
    setStatus("connecting");
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join", name }));
      setMyName(name);
      setStatus("connected");
      setScreen("chat");
      setMessages([]);
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "chat") addMsg(data.text);
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      setStatus("disconnected");
      addMsg("*** Disconnected from server ***");
    };

    ws.onerror = () => {
      setStatus("error");
      setJoinErr("Could not connect — is the gateway running?");
      setScreen("join");
    };
  }

  function sendMessage(text) {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "chat", text }));
    // Echo own message locally (server only broadcasts to others)
    addMsg(`[${myName}] ${text}`);
  }

  function leave() {
    wsRef.current?.close();
    setScreen("join");
    setStatus("disconnected");
    setMessages([]);
  }

  if (screen === "join") return <JoinScreen onJoin={connect} error={joinErr} />;
  return (
    <ChatScreen
      myName={myName}
      messages={messages}
      status={status}
      onSend={sendMessage}
      onLeave={leave}
    />
  );
}
