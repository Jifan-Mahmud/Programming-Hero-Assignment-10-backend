require("dotenv").config();
const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME;
const client = new MongoClient(uri);

async function run() {
  await client.connect();
  const db = client.db(dbName);

  await db.collection("user").updateOne(
    { email: "admin@pulseforge.com" },
    { $set: { role: "admin", status: "active" } }
  );
  await db.collection("user").updateOne(
    { email: "marcus.trainer@pulseforge.com" },
    { $set: { role: "trainer", status: "active" } }
  );
  await db.collection("user").updateOne(
    { email: "alex.athlete@pulseforge.com" },
    { $set: { role: "user", status: "active" } }
  );

  await db.collection("users").updateOne(
    { email: "admin@pulseforge.com" },
    {
      $set: {
        role: "admin",
        status: "active",
        name: "PulseForge Master Admin",
      },
    },
    { upsert: true }
  );
  await db.collection("users").updateOne(
    { email: "marcus.trainer@pulseforge.com" },
    {
      $set: {
        role: "trainer",
        status: "active",
        name: "Marcus Vance",
      },
    },
    { upsert: true }
  );
  await db.collection("users").updateOne(
    { email: "alex.athlete@pulseforge.com" },
    {
      $set: {
        role: "user",
        status: "active",
        name: "Alex Morgan",
      },
    },
    { upsert: true }
  );

  console.log("All demo user roles synchronized successfully in MongoDB!");
  await client.close();
}

run().catch(console.error);
