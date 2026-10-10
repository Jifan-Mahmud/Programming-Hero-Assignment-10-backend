require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const express = require("express");
const app = express();
const cors = require("cors");

const port = process.env.PORT;
const uri = process.env.MONGODB_URI;

app.use(cors());
app.use(express.json());

const dbName = process.env.DB_NAME;
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3001";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function runStableAPIConnect() {
  try {
    await client.connect();

    const result = await client.db("admin").command({ ping: 1 });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );

    return result;
  } catch (err) {
    console.dir(err);
    throw err;
  }
}

module.exports = { client, runStableAPIConnect };

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
