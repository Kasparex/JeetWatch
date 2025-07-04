const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());

const MONGO_URI = "mongodb+srv://kasparexcom:MArcinek12!@@cluster0.jmxeiuv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

const Wallet = mongoose.model("Wallet", new mongoose.Schema({
  wallet: String,
  token: String,
  received: Number,
  sent: Number,
  holdDuration: String,
  classification: String
}));

// Helper for jeet classification
function classifyWallet(wallet) {
  const { received, sent, holdHours } = wallet;
  const ratio = sent / received;
  if (ratio >= 0.9) {
    if (holdHours < 1) return "🔴 Ultra Jeet";
    if (holdHours < 24) return "🟡 True Jeet";
    if (holdHours < 72) return "⚪ Mild Jeet";
  }
  return "💎 Diamond Hand";
}

// API to fetch wallet activity from kas.fyi based on token ticker
app.get("/api/jeet/:ticker", async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();

  try {
    // Step 1: Get token info to find contract
    const tokensRes = await axios.get("https://kas.fyi/api/krc20");
    const tokenInfo = tokensRes.data.find(t => t.ticker === ticker);

    if (!tokenInfo) return res.status(404).json({ error: "Token not found" });

    const tokenAddress = tokenInfo.address;

    // Step 2: Get transfers for this token
    const txRes = await axios.get(`https://kas.fyi/api/krc20/transfers/${tokenAddress}`);
    const transfers = txRes.data;

    const wallets = {};

    for (const tx of transfers) {
      const { from, to, amount, timestamp } = tx;
      const date = new Date(timestamp);

      if (from === "kaspa:genesis") {
        wallets[to] = {
          wallet: to,
          received: parseFloat(amount),
          received_time: date,
          sent: 0,
          sent_time: null
        };
      } else if (wallets[from]) {
        wallets[from].sent = parseFloat(amount);
        wallets[from].sent_time = date;
      }
    }

    const results = [];

    for (const w of Object.values(wallets)) {
      const sent = w.sent || 0;
      const holdHours = w.sent_time
        ? (w.sent_time - w.received_time) / 1000 / 3600
        : null;
      const classification = classifyWallet({
        received: w.received,
        sent,
        holdHours: holdHours || 9999
      });
      const holdDuration = holdHours
        ? holdHours < 1
          ? `${Math.round(holdHours * 60)} mins`
          : `${holdHours.toFixed(1)} hrs`
        : "Still Holding";

      const finalData = {
        wallet: w.wallet,
        token: ticker,
        received: w.received,
        sent: sent,
        holdDuration,
        classification
      };

      await Wallet.updateOne(
        { wallet: w.wallet, token: ticker },
        finalData,
        { upsert: true }
      );

      results.push(finalData);
    }

    res.json(results);
  } catch (err) {
    console.error("Error fetching data:", err.message);
    res.status(500).json({ error: "Failed to fetch Jeet data" });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ Jeet Watch API running at http://localhost:${PORT}`));
