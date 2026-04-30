const express = require("express");
const app = express();

let goal = false;

app.get("/", (req, res) => {
  res.send("Goal Light Server is running");
});

app.get("/goal", (req, res) => {
  res.json({ goal });
});

app.get("/trigger", (req, res) => {
  goal = true;
  res.json({ success: true, goal });
});

app.get("/reset", (req, res) => {
  goal = false;
  res.json({ success: true, goal });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
