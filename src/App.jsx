import { useEffect, useMemo, useRef, useState } from "react";

function computeApiUrl() {
  // Priority: explicit env var
  const envUrl = import.meta.env.VITE_BACKEND_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) return envUrl.replace(/\/$/, "");
  // Heuristic: replace -3000 subdomain with -8000 (Modal-style hostnames)
  const origin = window.location.origin;
  const guess = origin.replace("-3000.", "-8000.");
  return guess;
}

const API_URL = computeApiUrl();

function useAuth() {
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  useEffect(() => {
    if (token) localStorage.setItem("token", token);
  }, [token]);
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  return { token, setToken, headers };
}

function Login({ onAuthed }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", mobile: "", password: "" });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "register") {
        const resp = await fetch(`${API_URL}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            mobile: form.mobile,
            password: form.password,
          }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          const msg = data?.detail || `Registration failed (${resp.status})`;
          alert(msg);
        } else if (data.access_token) {
          localStorage.setItem("token", data.access_token);
          onAuthed(data.access_token);
        } else {
          alert("Registration failed: unexpected response");
        }
      } else {
        // Backend expects JSON { email, password }
        const resp = await fetch(`${API_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: form.email, password: form.password }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          const msg = data?.detail || `Login failed (${resp.status})`;
          alert(msg);
        } else if (data.access_token) {
          localStorage.setItem("token", data.access_token);
          onAuthed(data.access_token);
        } else {
          alert("Login failed: unexpected response");
        }
      }
    } catch (e) {
      console.error(e);
      alert("Network error. Please check your backend URL configuration.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white shadow rounded p-6 space-y-4">
        <h1 className="text-xl font-semibold text-gray-800">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <div className="flex gap-2 text-sm">
          <button className={`px-3 py-1 rounded ${mode === "login" ? "bg-blue-600 text-white" : "bg-gray-100"}`} onClick={() => setMode("login")}>Login</button>
          <button className={`px-3 py-1 rounded ${mode === "register" ? "bg-blue-600 text-white" : "bg-gray-100"}`} onClick={() => setMode("register")}>Register</button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          {mode === "register" && (
            <input className="w-full border rounded px-3 py-2" placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          )}
          <input className="w-full border rounded px-3 py-2" placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          {mode === "register" && (
            <input className="w-full border rounded px-3 py-2" placeholder="Mobile (unique)" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} required />
          )}
          <input className="w-full border rounded px-3 py-2" placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <button disabled={loading} type="submit" className="w-full bg-blue-600 text-white rounded py-2">{loading ? 'Please wait…' : (mode === "login" ? "Login" : "Register")}</button>
          <div className="text-xs text-gray-500 text-center">Using API: {API_URL}</div>
        </form>
      </div>
    </div>
  );
}

function ChatUI({ token }) {
  const [me, setMe] = useState(null);
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const wsRef = useRef(null);

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    (async () => {
      const meData = await fetch(`${API_URL}/me`, { headers }).then((r) => r.json());
      setMe(meData);
      const chatData = await fetch(`${API_URL}/chats`, { headers }).then((r) => r.json());
      setChats(chatData);
    })();
  }, [token]);

  useEffect(() => {
    if (!me) return;
    const base = API_URL ? API_URL.replace(/^http/, 'ws') : window.location.origin.replace(/^http/, 'ws');
    const wsUrl = `${base}/ws/${me._id}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'message' && msg.data?.chat_id === activeChat?._id) {
          setMessages((m) => [...m, msg.data]);
        }
      } catch {}
    };
    return () => ws.close();
  }, [me]);

  const openChat = async (chat) => {
    setActiveChat(chat);
    const data = await fetch(`${API_URL}/chats/${chat._id}/messages`, { headers }).then((r) => r.json());
    setMessages(data);
    wsRef.current?.send(JSON.stringify({ type: 'join_chat', chat_id: chat._id }));
  };

  const send = async () => {
    if (!text.trim() || !activeChat) return;
    await fetch(`${API_URL}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ chat_id: activeChat._id, content: text })
    });
    setText("");
  };

  return (
    <div className="h-screen grid grid-cols-12">
      <aside className="col-span-4 border-r flex flex-col">
        <div className="p-4 border-b font-semibold">Chats</div>
        <div className="flex-1 overflow-y-auto">
          {chats.map((c) => (
            <button key={c._id} onClick={() => openChat(c)} className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${activeChat?._id===c._id?'bg-gray-100':''}`}>
              <div className="text-sm">{c.participant_ids.filter((id)=>id!==me?._id)[0]}</div>
            </button>
          ))}
        </div>
      </aside>
      <main className="col-span-8 flex flex-col">
        <div className="p-4 border-b">{activeChat ? 'Chat' : 'Select a chat'}</div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {messages.map((m) => (
            <div key={m._id} className={`max-w-[70%] px-3 py-2 rounded ${m.sender_id===me?._id?'bg-blue-600 text-white ml-auto':'bg-gray-200'}`}>
              {m.content}
            </div>
          ))}
        </div>
        <div className="p-3 border-t flex gap-2">
          <input value={text} onChange={(e)=>setText(e.target.value)} className="flex-1 border rounded px-3 py-2" placeholder="Type a message" />
          <button onClick={send} className="bg-blue-600 text-white px-4 rounded">Send</button>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token')||'');
  if (!token) return <Login onAuthed={setToken} />;
  return <ChatUI token={token} />;
}
