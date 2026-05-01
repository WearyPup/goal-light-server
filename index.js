const express = require("express");
const app = express();

const devices = {};

function getDevice(deviceId) {
  if (!deviceId) return null;

  if (!devices[deviceId]) {
    devices[deviceId] = {
      team: "DAL",
      goal: false,
      lastScore: null,
      tvDelayMs: 0,
      syncData: null,
      pendingGoal: false
    };
  }

  return devices[deviceId];
}

function timeToSeconds(time) {
  if (!time) return null;
  const parts = time.split(":");
  if (parts.length !== 2) return null;

  const min = parseInt(parts[0]);
  const sec = parseInt(parts[1]);

  if (isNaN(min) || isNaN(sec)) return null;

  return min * 60 + sec;
}

function findGameForTeam(games, team) {
  return games.find(game =>
    game.homeTeam?.abbrev === team || game.awayTeam?.abbrev === team
  );
}

function getTeamScore(game, team) {
  if (game.homeTeam?.abbrev === team) return game.homeTeam.score;
  if (game.awayTeam?.abbrev === team) return game.awayTeam.score;
  return null;
}

function scheduleGoal(deviceId, delayMs) {
  const device = devices[deviceId];
  if (!device || device.pendingGoal) return;

  device.pendingGoal = true;

  setTimeout(() => {
    device.goal = true;
    device.pendingGoal = false;
    console.log("🚨 BUT déclenché pour", deviceId);
  }, delayMs);
}

async function checkGoals() {
  try {
    const res = await fetch("https://api-web.nhle.com/v1/score/now");
    const data = await res.json();
    const games = data.games || [];

    for (const deviceId of Object.keys(devices)) {
      const device = devices[deviceId];
      const team = device.team;

      const game = findGameForTeam(games, team);
      if (!game) continue;

      const score = getTeamScore(game, team);
      if (score === null || score === undefined) continue;

      if (device.lastScore === null) {
        device.lastScore = score;
        console.log(deviceId, team, "score initial:", score);
        continue;
      }

      if (score > device.lastScore) {
        console.log("BUT détecté API pour", deviceId, team);

        scheduleGoal(deviceId, device.tvDelayMs || 0);
      }

      device.lastScore = score;
    }
  } catch (err) {
    console.log("Erreur API NHL:", err.message);
  }
}

setInterval(checkGoals, 2000);

app.get("/", (req, res) => {
  res.send("Goal Light Server running");
});

app.get("/register", (req, res) => {
  const deviceId = req.query.deviceId;
  const device = getDevice(deviceId);

  if (!device) {
    return res.json({ success: false, message: "deviceId manquant" });
  }

  res.json({
    success: true,
    deviceId,
    device
  });
});

app.get("/setTeam", (req, res) => {
  const deviceId = req.query.deviceId;
  const team = req.query.team;

  const device = getDevice(deviceId);

  if (!device) {
    return res.json({ success: false, message: "deviceId manquant" });
  }

  if (!team) {
    return res.json({ success: false, message: "team manquant" });
  }

  device.team = team.toUpperCase();
  device.lastScore = null;
  device.goal = false;
  device.pendingGoal = false;

  console.log("Équipe changée:", deviceId, device.team);

  res.json({
    success: true,
    deviceId,
    team: device.team
  });
});

app.get("/goal", (req, res) => {
  const deviceId = req.query.deviceId;
  const device = getDevice(deviceId);

  if (!device) {
    return res.json({ success: false, message: "deviceId manquant" });
  }

  const currentGoal = device.goal;
  device.goal = false;

  res.json({
    success: true,
    deviceId,
    team: device.team,
    goal: currentGoal
  });
});

app.get("/trigger", (req, res) => {
  const deviceId = req.query.deviceId;
  const device = getDevice(deviceId);

  if (!device) {
    return res.json({ success: false, message: "deviceId manquant" });
  }

  scheduleGoal(deviceId, device.tvDelayMs || 0);

  res.json({
    success: true,
    message: "Test but déclenché",
    deviceId,
    delayMs: device.tvDelayMs
  });
});

app.get("/reset", (req, res) => {
  const deviceId = req.query.deviceId;
  const device = getDevice(deviceId);

  if (!device) {
    return res.json({ success: false, message: "deviceId manquant" });
  }

  device.goal = false;
  device.lastScore = null;
  device.pendingGoal = false;
  device.tvDelayMs = 0;

  res.json({
    success: true,
    deviceId,
    message: "Device reset"
  });
});

app.get("/sync", async (req, res) => {
  const deviceId = req.query.deviceId;
  const period = parseInt(req.query.period);
  const gameTime = req.query.gameTime;
  const clickTime = req.query.clickTime;

  const device = getDevice(deviceId);

  if (!device) {
    return res.json({ success: false, message: "deviceId manquant" });
  }

  if (!period || !gameTime) {
    return res.json({ success: false, message: "Période ou temps TV manquant" });
  }

  try {
    const apiRes = await fetch("https://api-web.nhle.com/v1/score/now");
    const data = await apiRes.json();
    const games = data.games || [];

    const game = findGameForTeam(games, device.team);

    if (!game) {
      return res.json({
        success: false,
        message: "Aucun match trouvé pour " + device.team
      });
    }

    const apiPeriod = game.periodDescriptor?.number;
    const apiTime = game.clock?.timeRemaining;
    const gameState = game.gameState;

    if (gameState !== "LIVE") {
      return res.json({
        success: false,
        message: "Le match n'est pas LIVE. Réessaie pendant le jeu."
      });
    }

    if (apiPeriod !== period) {
      return res.json({
        success: false,
        message: `La période ne correspond pas. API: P${apiPeriod}, TV: P${period}`
      });
    }

    const tvSeconds = timeToSeconds(gameTime);
    const apiSeconds = timeToSeconds(apiTime);

    if (tvSeconds === null || apiSeconds === null) {
      return res.json({
        success: false,
        message: "Format de temps invalide. Utilise MM:SS"
      });
    }

    let delaySeconds = tvSeconds - apiSeconds;

    if (delaySeconds < 0) delaySeconds = 0;

    device.tvDelayMs = delaySeconds * 1000;

    device.syncData = {
      period,
      tvTime: gameTime,
      apiTime,
      clickTime,
      delaySeconds,
      savedAt: new Date().toISOString()
    };

    console.log("SYNC:", deviceId, device.syncData);

    res.json({
      success: true,
      deviceId,
      team: device.team,
      message: `Synchro sauvegardée: délai ${delaySeconds} secondes`,
      syncData: device.syncData
    });

  } catch (err) {
    res.json({
      success: false,
      message: "Erreur sync: " + err.message
    });
  }
});

app.get("/status", (req, res) => {
  const deviceId = req.query.deviceId;
  const device = getDevice(deviceId);

  if (!device) {
    return res.json({ success: false, message: "deviceId manquant" });
  }

  res.json({
    success: true,
    deviceId,
    device
  });
});

app.get("/devices", (req, res) => {
  res.json(devices);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Serveur lancé sur port", PORT);
});
