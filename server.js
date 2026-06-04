const express = require("express");
const cors = require("cors");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50kb" }));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.post("/analyze", async (req, res) => {
  const { cv } = req.body;
  if (!cv || cv.trim().length < 50) {
    return res.status(400).json({ error: "CV trop court ou vide." });
  }

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Tu es un expert en recrutement data & IA et en optimisation ATS (Applicant Tracking System).
Analyse ce CV et retourne UNIQUEMENT un objet JSON valide, sans texte avant ni après, sans markdown, sans backticks.

Structure JSON attendue :
{
  "score": <nombre entier entre 0 et 100>,
  "niveau": "<Insuffisant | Passable | Bon | Très bon | Excellent>",
  "points_forts": ["<point 1>", "<point 2>", "<point 3>"],
  "points_faibles": ["<point 1>", "<point 2>", "<point 3>"],
  "recommandations": ["<action concrète 1>", "<action concrète 2>", "<action concrète 3>"],
  "metiers_compatibles": ["<métier data 1>", "<métier data 2>", "<métier data 3>"]
}

Critères d'évaluation ATS pour les métiers data :
- Présence de mots-clés techniques data (SQL, Python, Power BI, etc.)
- Structure claire (expériences, formations, compétences)
- Quantification des résultats
- Adéquation avec les standards ATS (pas de tableaux complexes, pas d'images)
- Pertinence pour le marché data français

CV à analyser :
${cv}`
        }
      ]
    });

    const raw = message.content[0].text.trim();
    const parsed = JSON.parse(raw);
    res.json(parsed);

  } catch (err) {
    console.error(err);
    if (err instanceof SyntaxError) {
      return res.status(500).json({ error: "Erreur de parsing JSON depuis Claude." });
    }
    res.status(500).json({ error: "Erreur serveur : " + err.message });
  }
});

app.get("/", (req, res) => res.json({ status: "CVAI backend en ligne ✅" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CVAI backend démarré sur le port ${PORT}`));
