const Fastify = require("fastify");
const WebSocket = require("ws");
const fs = require("fs");

const fastify = Fastify({ logger: false });
const PORT = process.env.PORT || 3000;

// Đọc file du_doan.txt
const duDoanData = fs.readFileSync("du_doan.txt", "utf8");

function duDoanTuPattern(pattern13) {
  const line = duDoanData.split("\n").find(line => line.startsWith(pattern13));
  if (!line) return null;
  if (line.includes("Dự đoán: T")) return "Tài";
  if (line.includes("Dự đoán: X")) return "Xỉu";
  return null;
}

let lastResults = [];
let ws = null;
let reconnectInterval = 5000;
let intervalCmd = null;

function sendCmd1005() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    const payload = [6, "MiniGame", "taixiuPlugin", { cmd: 1005 }];
    ws.send(JSON.stringify(payload));
  }
}

function connectWebSocket() {
  ws = new WebSocket("wss://websocket.azhkthg1.net/websocket");

  ws.on("open", () => {
    const authPayload = [
      1, "MiniGame", "SC_xigtupou", "conga999", {
        info: "{\"ipAddress\":\"171.246.10.199\",\"userId\":\"7c54ec3f-ee1a-428c-a56e-1bc14fd27e57\",\"username\":\"SC_xigtupou\",\"timestamp\":1748266471861,\"refreshToken\":\"ce8de19af18f4417bb68c3632408d4d7.479079475124482181468c8923b636af\"}",
        signature: "0EC9..." // Rút gọn
      }
    ];
    ws.send(JSON.stringify(authPayload));
    clearInterval(intervalCmd);
    intervalCmd = setInterval(sendCmd1005, 5000);
  });

  ws.on("message", (data) => {
    try {
      const json = JSON.parse(data);
      if (Array.isArray(json) && json[1]?.htr) {
        lastResults = json[1].htr.map(item => ({
          sid: item.sid,
          d1: item.d1,
          d2: item.d2,
          d3: item.d3
        }));
      }
    } catch {}
  });

  ws.on("close", () => {
    clearInterval(intervalCmd);
    setTimeout(connectWebSocket, reconnectInterval);
  });

  ws.on("error", () => ws.close());
}

connectWebSocket();

function analyzePrediction() {
  const recent13 = lastResults.slice(0, 13);
  if (recent13.length < 13) return { prediction: null, pattern13: "", reason: "Chưa đủ 13 phiên" };

  const pattern13 = recent13.map(r => {
    const sum = r.d1 + r.d2 + r.d3;
    return sum >= 11 ? "T" : "X";
  }).reverse().join("");

  const prediction = duDoanTuPattern(pattern13);
  return {
    prediction,
    pattern13,
    reason: prediction ? "Khớp pattern từ file" : "Không khớp pattern nào"
  };
}

fastify.get("/api/taixiu", async () => {
  const current = lastResults[0];
  if (!current) {
    return {
      current_result: null,
      current_session: null,
      next_session: null,
      prediction: null,
      used_pattern: "",
      reason: "Chưa có dữ liệu"
    };
  }

  const sum = current.d1 + current.d2 + current.d3;
  const result = sum >= 11 ? "Tài" : "Xỉu";
  const currentSession = current.sid;
  const nextSession = currentSession + 1;
  const duDoan = analyzePrediction();

  return {
    current_result: result,
    current_session: currentSession,
    next_session: nextSession,
    prediction: duDoan.prediction,
    used_pattern: duDoan.pattern13,
    reason: duDoan.reason
  };
});

fastify.listen({ port: PORT, host: "0.0.0.0" }).then(addr => {
  console.log("✅ Server đang chạy tại:", addr);
});
