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
    const db = client.db(dbName);
     // Collections
    const usersCollection = db.collection("users");
    const classesCollection = db.collection("classes");
    const bookingsCollection = db.collection("bookings");
    const favoritesCollection = db.collection("favorites");
    const trainerApplicationsCollection = db.collection("trainer_applications");
    const forumPostsCollection = db.collection("forum_posts");
    const notificationsCollection = db.collection("notifications");


    app.get("/api/classes", async (req, res) => {
      try {
        const {
          search = "",
          category = "",
          page = 1,
          limit = 6,
          featured = "false",
        } = req.query;

        const query = { status: "Approved" };

        // Search by class name using MongoDB $regex (Challenge Requirement 1)
        if (search.trim()) {
          query.name = { $regex: search.trim(), $options: "i" };
        }

        // Filter by category using MongoDB $in (Challenge Requirement 2)
        if (category && category !== "all") {
          const categories = category
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean);
          if (categories.length > 0) {
            query.category = { $in: categories };
          }
        }

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.max(1, parseInt(limit) || 6);
        const skip = (pageNum - 1) * limitNum;

        // Sorting: If featured, sort by bookingCount desc
        const sortOptions =
          featured === "true" ? { bookingCount: -1, createdAt: -1 } : { createdAt: -1 };

        const total = await classesCollection.countDocuments(query);
        const classes = await classesCollection
          .find(query)
          .sort(sortOptions)
          .skip(skip)
          .limit(limitNum)
          .toArray();

        res.json({
          classes,
          total,
          totalPages: Math.ceil(total / limitNum) || 1,
          currentPage: pageNum,
        });
      } catch (err) {
        console.error("Classes fetch error:", err);
        res.status(500).json({ message: "Failed to fetch classes" });
      }
    });


     app.get("/api/classes/featured", async (req, res) => {
      try {
        const classes = await classesCollection
          .find({ status: "Approved" })
          .sort({ bookingCount: -1, createdAt: -1 })
          .limit(6)
          .toArray();
        res.json(classes);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch featured classes" });
      }
    });

    app.get("/api/classes/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid class ID format" });
        }

        const singleClass = await classesCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!singleClass) {
          return res.status(404).json({ message: "Class not found" });
        }

        res.json(singleClass);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch class" });
      }
    });

    console.log(`Connected to MongoDB database: ${dbName}`);

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
