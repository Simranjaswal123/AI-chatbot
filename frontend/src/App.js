import React, { useState, useEffect, useRef } from "react";
import { FaUpload, FaPaperPlane, FaTrash, FaSave, FaSearch, FaPlus, FaCog } from "react-icons/fa";
import "./App.css";

function App() {
  const [prompt, setPrompt] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [image, setImage] = useState(null);
  const [humor, setHumor] = useState(0.5);
  const [emotion, setEmotion] = useState("neutral");
  const [roast, setRoast] = useState(false);
  const chatEndRef = useRef(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    fetchHistory();
    fetchSettings();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const fetchHistory = async () => {
    try {
      const res = await fetch("http://localhost:5000/history");
      const data = await res.json();
      setHistory(data.history);
    } catch (error) {
      console.error("Error fetching history:", error);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch("http://localhost:5000/settings");
      const data = await res.json();
      setHumor(data.humor);
      setEmotion(data.emotion);
      setRoast(data.roast);
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
  };

  const saveSettings = async () => {
    try {
      await fetch("http://localhost:5000/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ humor, emotion, roast }),
      });
      setShowSettings(false);
    } catch (error) {
      console.error("Error saving settings:", error);
    }
  };

  const handleFileUpload = (event) => {
    setFile(event.target.files[0]);
  };

  const handleImageUpload = (event) => {
    setImage(event.target.files[0]);
  };

  const generateText = () => {
    if (!prompt.trim() && !file && !image) return;
    setLoading(true);

    const formData = new FormData();
    formData.append("prompt", prompt);
    if (file) formData.append("file", file);
    if (image) formData.append("image", image);

    setHistory((prev) => [...prev, { role: "user", content: prompt }]);
    setPrompt("");

    const eventSource = new EventSource("http://localhost:5000/generate", {
      method: "POST",
      body: formData,
    });

    let currentResponse = "";

    eventSource.onmessage = (event) => {
      const parsed = JSON.parse(event.data);

      if (parsed.status === "generating") {
        setHistory((prev) => [...prev, { role: "assistant", content: "", generating: true }]);
      } else if (parsed.text) {
        currentResponse += parsed.text;
        setHistory((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.generating) {
            return [...prev.slice(0, -1), { role: "assistant", content: currentResponse, generating: true }];
          }
          return prev;
        });
      } else if (parsed.status === "done") {
        setHistory((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.generating) {
            return [...prev.slice(0, -1), { role: "assistant", content: currentResponse, generating: false }];
          }
          return prev;
        });
        setLoading(false);
        eventSource.close();
      } else if (parsed.error) {
        setHistory((prev) => [...prev, { role: "assistant", content: parsed.error, generating: false }]);
        setLoading(false);
        eventSource.close();
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE Error:", error);
      setHistory((prev) => [...prev, { role: "assistant", content: "Error occurred while generating story.", generating: false }]);
      setLoading(false);
      eventSource.close();
    };
  };

  const clearChat = () => {
    setHistory([]);
  };

  const saveChat = () => {
    const chatData = history.map((entry) => `${entry.role.toUpperCase()}: ${entry.content}`).join("\n");
    const blob = new Blob([chatData], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "chat_history.txt";
    link.click();
  };

  return (
    <div className="chat-container">
      <div className="dark-overlay"></div>
      <div className="chat-header">
        <h1 className="welcome-text">How Can I Be Of Help Today?</h1>
        <div className="header-buttons">
          <button className="new-chat-button" onClick={clearChat} disabled={loading}>
            <FaPlus /> New Chat
          </button>
          <button className="settings-button" onClick={() => setShowSettings(true)} disabled={loading}>
            <FaCog /> Settings
          </button>
        </div>
      </div>

      <div className="chat-body">
        {history.length === 0 ? (
          <div className="empty-chat">
            <h2>AI Creative Writing Bot</h2>
            <p>Start typing below to begin our conversation</p>
          </div>
        ) : (
          <div className="chat-messages">
            {history.map((entry, index) => (
              <div key={index} className={`message ${entry.role} ${entry.generating ? "generating" : ""}`}>
                <div className="message-content">
                  {entry.generating && !entry.content ? (
                    <div className="generating-animation">
                      <span>.</span>
                      <span>.</span>
                      <span>.</span>
                    </div>
                  ) : (
                    entry.content
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>
      {showSettings && (
        <div className="settings-modal">
          <div className="settings-content">
            <h2>Settings</h2>
            <label>
              Humor:
              <input type="range" min="0" max="1" step="0.1" value={humor} onChange={(e) => setHumor(e.target.value)} disabled={loading} />
              {humor}
            </label>
            <label>
              Emotion:
              <select value={emotion} onChange={(e) => setEmotion(e.target.value)} disabled={loading}>
                <option value="neutral">Neutral</option>
                <option value="happy">Happy</option>
                <option value="sad">Sad</option>
                <option value="angry">Angry</option>
              </select>
            </label>
            <label>
              Roast:
              <input type="checkbox" checked={roast} onChange={(e) => setRoast(e.target.checked)} disabled={loading} />
            </label>
            <div className="settings-buttons">
              <button onClick={saveSettings}>Save</button>
              <button onClick={() => setShowSettings(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="chat-footer">
        <div className="input-container">
          <textarea
            className="chat-input"
            rows="1"
            placeholder="Type a message..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && !e.shiftKey && !loading && generateText()}
            disabled={loading}
          />
          <button className="send-button" onClick={generateText} disabled={loading}>
            {loading ? "..." : <FaPaperPlane />}
          </button>
        </div>
        <div className="footer-actions">
          <div className="upload-buttons">
            <label className="upload-label">
              <FaUpload /> File
              <input type="file" onChange={handleFileUpload} hidden disabled={loading} />
            </label>
            <label className="upload-label">
              <FaUpload /> Image
              <input type="file" accept="image/*" onChange={handleImageUpload} hidden disabled={loading} />
            </label>
          </div>
          <div className="action-buttons">
            <button className="action-btn" onClick={clearChat} disabled={loading}>
              <FaTrash /> Clear
            </button>
            <button className="action-btn" onClick={saveChat} disabled={loading}>
              <FaSave /> Save
            </button>
            <button className="action-btn" disabled={loading}>
              <FaSearch /> Search
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;