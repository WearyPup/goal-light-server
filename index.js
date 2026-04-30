const express = require("express");
const app = express();

let goal = false;
let lastScore = 0;

// 👉 CHANGE ICI TON ÉQUIPE
const TEAM = "MTL"; // Canadiens

async function checkGoal() {
  try {
    const res = await fetch("https://api-web.nhle.com/v1/score/now");
    const data = await res.json();

    const games = data.games;

    for (let game of games) {
      const home = game.homeTeam.abbrev;
      const away = game.awayTeam.abbrev;

      if (home === TEAM || away === TEAM) {
        let score;

        if (home === TEAM) {
          score = game.homeTeam.score;
        } else {
          score = game.awayTeam.score;
        }

        console.log("Score actuel:", score);

        if (score > lastScore) {
          console.log("🚨 BUT !!!");
          goal = true;
        }

        lastScore = score;
      }
    }
  } catch (err) {
    console.log("Erreur API:", err);
  }
}

// check chaque 10 secondes
setInterval(checkGoal, 10000);

app.get("/goal", (req, res) => {
  res.json({ goal });
  goal = false; // reset après lecture
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Serveur lancé");
});
