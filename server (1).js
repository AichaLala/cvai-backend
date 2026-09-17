// CVAI backend — Node.js / Express
// Appelle OpenRouter (compatible OpenAI). Le client ne voit jamais la cle.

const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());                       // autorise les appels depuis le frontend
app.use(express.json({ limit: "1mb" }));

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// "openrouter/free" = routeur qui choisit tout seul un modele gratuit dispo.
// Si un modele est retire, il en prend un autre -> plus jamais de modele mort a corriger.
const MODEL = process.env.LLM_MODEL || "openrouter/free";

const SYSTEM_PROMPT = `Tu es un expert en recrutement data et en optimisation de CV pour les systemes ATS.
On te donne le texte brut d'un CV. Tu l'analyses pour les metiers de la data (Data Analyst,
Business Analyst, Data Engineer, Data Scientist, BI Analyst).

Tu reponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans balises Markdown,
avec EXACTEMENT ces cles :
{
  "score": (entier de 0 a 100, score ATS global),
  "niveau": "(courte etiquette : Tres bon / Correct / A retravailler)",
  "points_forts": ["3 a 5 points concrets"],
  "points_faibles": ["3 a 5 points concrets"],
  "recommandations": ["3 a 5 actions ATS concretes et actionnables"],
  "metiers_compatibles": ["2 a 5 intitules de postes data compatibles"]
}

Reponds en francais. Sois concret et specifique au contenu du CV, jamais generique.
Les tableaux ne doivent jamais etre vides.`;

// --- utils ---------------------------------------------------------------

function parseJSON(raw) {
  let t = (raw || "").trim().replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(t);
  } catch (e) {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("Reponse illisible du modele.");
  }
}

function asList(v) {
  if (Array.isArray(v)) return v.map(String).filter((x) => x.trim());
  return v ? [String(v)] : [];
}

function normalize(d) {
  let s = parseInt(d.score, 10);
  if (isNaN(s)) s = 0;
  s = Math.max(0, Math.min(100, s));
  return {
    score: s,
    niveau: (d.niveau || "Non evalue").toString(),
    points_forts: asList(d.points_forts),
    points_faibles: asList(d.points_faibles),
    recommandations: asList(d.recommandations),
    metiers_compatibles: asList(d.metiers_compatibles),
  };
}

async function callOpenRouter(payload) {
  return fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + process.env.OPENROUTER_API_KEY,
      "HTTP-Referer": "https://cvai.app",
      "X-Title": "CVAI",
    },
    body: JSON.stringify(payload),
  });
}

// --- routes --------------------------------------------------------------

app.get("/", (req, res) => {
  res.json({ status: "ok", provider: "openrouter", model: MODEL });
});

app.post("/analyze", async (req, res) => {
  const cv = ((req.body && req.body.cv) || "").trim();

  if (cv.length < 50) {
    return res.status(400).json({ error: "Colle au moins quelques lignes de ton CV." });
  }
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: "Cle API manquante cote serveur (OPENROUTER_API_KEY)." });
  }

  try {
    const payload = {
      model: MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: cv },
      ],
    };

    // 1er essai avec JSON structure ; si le modele route ne le supporte pas, on reessaie sans.
    let r = await callOpenRouter(payload);
    if (!r.ok) {
      const { response_format, ...withoutFormat } = payload;
      r = await callOpenRouter(withoutFormat);
    }
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error((err.error && err.error.message) || "Erreur OpenRouter " + r.status);
    }

    const data = await r.json();
    const raw = data.choices && data.choices[0] && data.choices[0].message.content;
    res.json(normalize(parseJSON(raw)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("CVAI backend on :" + PORT + " (model: " + MODEL + ")"));
