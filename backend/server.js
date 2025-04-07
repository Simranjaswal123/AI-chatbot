const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const https = require("https");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors({
  origin: "http://localhost:3000", 
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

const upload = multer({ storage: multer.memoryStorage() });
const agent = new https.Agent({ rejectUnauthorized: false });

const COHERE_API_KEY = process.env.COHERE_API_KEY;
const COHERE_URL = "https://api.cohere.ai/v1/generate";




if (!COHERE_API_KEY) {
  console.error("Error: COHERE_API_KEY is not set in the environment variables.");
  process.exit(1);
}

let conversationHistory = [];
let settings = { humor: 0.5, emotion: "neutral", roast: false };


app.get("/settings", (req, res) => {
  res.json(settings);
});

app.post("/settings", (req, res) => {
  const { humor, emotion, roast } = req.body;
  settings = { 
    humor: Math.max(0, Math.min(1, parseFloat(humor) || 0.5)),
    emotion: emotion || "neutral",
    roast: !!roast 
  };
  res.json({ message: "Settings updated", settings });
});


app.get("/history", (req, res) => {
  res.json({ history: conversationHistory.slice(-10) });
});

app.post("/history/edit/:index", (req, res) => {
  const { index } = req.params;
  const { content } = req.body;
  
  if (index >= 0 && index < conversationHistory.length && conversationHistory[index].role === "user") {
    conversationHistory[index].content = content;
    res.json({ message: "Message updated", history: conversationHistory.slice(-10) });
  } else {
    res.status(400).json({ error: "Invalid message index or not a user message" });
  }
});


app.post("/generate", upload.fields([{ name: "file" }, { name: "image" }]), async (req, res) => {
  try {
    const { prompt } = req.body;
    const file = req.files?.file?.[0];
    const image = req.files?.image?.[0];

    if (!prompt && !file && !image) {
      return res.status(400).json({ error: "Prompt, file, or image is required" });
    }

    
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    
    res.write(`data: ${JSON.stringify({ status: "generating" })}\n\n`);

  
    let fullPrompt = prompt ? `User: ${prompt}` : "";
    if (file) fullPrompt += `\n\n[File Content: ${file.buffer.toString("utf8")}]`;
    if (image) fullPrompt += `\n\n[Image Uploaded: ${image.originalname}]`;

    const message = { 
      role: "user", 
      content: fullPrompt,
      timestamp: new Date().toISOString()
    };
    conversationHistory.push(message);

    let enhancedPrompt = `${fullPrompt}\n\nWrite a complete story with a beginning, middle, and end.`;
    if (settings.roast) {
      enhancedPrompt += " Start with a witty roast before proceeding.";
    }
    enhancedPrompt += ` Infuse with ${settings.emotion} emotion and humor level ${settings.humor} (0-1 scale).`;
    enhancedPrompt += " End with a natural question like 'Want modifications?'.";

    const finalPrompt = conversationHistory
      .map(entry => `${entry.role.toUpperCase()}: ${entry.content}`)
      .join("\n") + `\nASSISTANT: ${enhancedPrompt}`;

   
    const cohereResponse = await axios.post(
      COHERE_URL,
      {
        model: "command",
        prompt: finalPrompt,
        max_tokens: 1000,
        temperature: 0.7 + (settings.humor * 0.3), 
        stop_sequences: ["The End.", "Conclusion:", "Fin."],
        k: Math.round(settings.humor * 100),
        return_likelihoods: "NONE",
        stream: true 
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GEMINI_API_KEY}`,
        },
        httpsAgent: agent,
        responseType: "stream"
      }
    );

    let generatedText = "";
    cohereResponse.data.on("data", (chunk) => {
      const text = chunk.toString();
      const lines = text.split("\n");
      
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) {
              generatedText += data.text;
              res.write(`data: ${JSON.stringify({ text: data.text })}\n\n`);
            }
          } catch (e) {
            console.error("Error parsing stream chunk:", e);
          }
        }
      }
    });

    cohereResponse.data.on("end", () => {
      const assistantMessage = { 
        role: "assistant", 
        content: generatedText,
        timestamp: new Date().toISOString()
      };
      conversationHistory.push(assistantMessage);
      
      res.write(`data: ${JSON.stringify({ status: "done" })}\n\n`);
      res.end();
    });

    cohereResponse.data.on("error", (error) => {
      throw error;
    });

  } catch (error) {
    console.error("Generation Error:", error);
    const errorMessage = axios.isAxiosError(error) 
      ? (error.response?.data?.message || "Cohere API error")
      : error.message || "Internal server error";
    
    res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
    res.end();
  }
});

app.post("/history/clear", (req, res) => {
  conversationHistory = [];
  res.json({ message: "Conversation history cleared" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("Settings initialized:", settings);
});