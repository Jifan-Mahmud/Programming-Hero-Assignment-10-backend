require("dotenv").config();
const bcrypt = require("bcrypt");
const { MongoClient, ObjectId } = require("mongodb");

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || "pulseforge_db";
const client = new MongoClient(uri);

async function runSeed() {
  try {
    await client.connect();
    const db = client.db(dbName);

    const classesCollection = db.collection("classes");
    const forumPostsCollection = db.collection("forum_posts");
    const usersCollection = db.collection("users");

    // Clean existing if needed
    await classesCollection.deleteMany({});
    await forumPostsCollection.deleteMany({});

    // Seed classes directly from MongoDB Atlas 'defaultValu' collection
    const defaultValuCollection = db.collection("defaultValu");
    const atlasClasses = await defaultValuCollection.find({}).toArray();

    if (atlasClasses && atlasClasses.length > 0) {
      const classesToInsert = atlasClasses.map((item) => {
        const { _id, ...rest } = item;
        return {
          _id: typeof _id === "string" ? new ObjectId(_id) : _id,
          ...rest,
          createdAt: rest.createdAt ? new Date(rest.createdAt) : new Date(),
        };
      });

      await classesCollection.insertMany(classesToInsert);
      console.log(`Seeded ${classesToInsert.length} classes directly from Atlas 'defaultValu' collection.`);
    } else {
      console.log("Warning: No class documents found in Atlas 'defaultValu' collection.");
    }

    // Seed forum posts
    const samplePosts = [
      {
        title: "The Ultimate Guide to Pre-Workout Nutrition & Sustained Energy",
        image: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?q=80&w=1000&auto=format&fit=crop",
        description: "Optimal nutrition can elevate your workout from mediocre to peak performance. In this comprehensive guide, we dissect complex carbohydrates vs fast-acting glucose, electrolytes timing, and hydration strategies to fuel high-intensity sessions without gastrointestinal distress. Remember to balance glycemic index and ingest protein 60-90 minutes prior to lifting heavy.",
        authorName: "Marcus Vance",
        authorEmail: "marcus.trainer@pulseforge.com",
        authorRole: "trainer",
        authorImage: "https://images.unsplash.com/photo-1568602471122-7832951cc4c5?q=80&w=400&auto=format&fit=crop",
        likes: ["admin@pulseforge.com"],
        dislikes: [],
        comments: [
          {
            id: "c1",
            userEmail: "alex.athlete@pulseforge.com",
            userName: "Alex Morgan",
            userImage: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=400&auto=format&fit=crop",
            content: "This changed my morning workouts completely! The oats and banana combo gave me steady power through my 75-minute lifting session.",
            createdAt: new Date(),
            replies: [],
          },
        ],
        createdAt: new Date(Date.now() - 3 * 86400000),
      },
      {
        title: "Breathwork & Heart Rate Recovery: Science Behind Cold Down Regulation",
        image: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?q=80&w=1000&auto=format&fit=crop",
        description: "Most athletes focus obsessively on exertion, but true athletic adaptation occurs during nervous system recovery. Learn how 4-7-8 breathing downregulates sympathetic overdrive, reduces post-exercise cortisol levels, and accelerates lymphatic clearance so you wake up ready to perform tomorrow.",
        authorName: "Elena Rostova",
        authorEmail: "elena.yoga@pulseforge.com",
        authorRole: "trainer",
        authorImage: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=400&auto=format&fit=crop",
        likes: [],
        dislikes: [],
        comments: [],
        createdAt: new Date(Date.now() - 2 * 86400000),
      },
      {
        title: "Breaking Plateaus: Progressive Overload Mechanics for Strength",
        image: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1000&auto=format&fit=crop",
        description: "Stuck on your bench press or deadlift numbers for months? Discover micro-loading strategies, wave loading, and how adjusting rep cadence from 2-0-2 to 4-1-1 stimulates untapped myofibrillar hypertrophy. Track volume load mathematically to break any stagnation.",
        authorName: "Derrick Cole",
        authorEmail: "derrick.coach@pulseforge.com",
        authorRole: "trainer",
        authorImage: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400&auto=format&fit=crop",
        likes: [],
        dislikes: [],
        comments: [],
        createdAt: new Date(Date.now() - 1 * 86400000),
      },
      {
        title: "Welcome to PulseForge Community: Guidelines, Safety & Goals",
        image: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=1000&auto=format&fit=crop",
        description: "Welcome to PulseForge! Our forum is built on mutual respect, evidence-based fitness advice, and relentless encouragement. Whether you are stepping into a gym for the first time or training for your first triathlon, share your milestones, ask questions, and lift each other up.",
        authorName: "PulseForge Admin",
        authorEmail: "admin@pulseforge.com",
        authorRole: "admin",
        authorImage: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=400&auto=format&fit=crop",
        likes: [],
        dislikes: [],
        comments: [],
        createdAt: new Date(),
      },
    ];

    await forumPostsCollection.insertMany(samplePosts);
    console.log("Seeded posts:", samplePosts.length);

    // Seed trainers and admin into users collection
    const adminPassword = await bcrypt.hash("Admin@123", 10);
    const trainerPassword = await bcrypt.hash("Trainer@123", 10);
    const memberPassword = await bcrypt.hash("Member@123", 10);

    const sampleUsers = [
      {
        name: "PulseForge Admin",
        email: "admin@pulseforge.com",
        image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=400&auto=format&fit=crop",
        role: "admin",
        status: "active",
        password: adminPassword,
        createdAt: new Date(),
      },
      {
        name: "Marcus Vance",
        email: "marcus.trainer@pulseforge.com",
        image: "https://images.unsplash.com/photo-1568602471122-7832951cc4c5?q=80&w=400&auto=format&fit=crop",
        role: "trainer",
        status: "active",
        password: trainerPassword,
        createdAt: new Date(),
      },
      {
        name: "Elena Rostova",
        email: "elena.yoga@pulseforge.com",
        image: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=400&auto=format&fit=crop",
        role: "trainer",
        status: "active",
        password: trainerPassword,
        createdAt: new Date(),
      },
      {
        name: "Derrick Cole",
        email: "derrick.coach@pulseforge.com",
        image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400&auto=format&fit=crop",
        role: "trainer",
        status: "active",
        password: trainerPassword,
        createdAt: new Date(),
      },
      {
        name: "Alex Morgan",
        email: "alex.athlete@pulseforge.com",
        image: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=400&auto=format&fit=crop",
        role: "user",
        status: "active",
        password: memberPassword,
        createdAt: new Date(),
      },
    ];

    // Clean and re-insert users to ensure passwords are set
    await usersCollection.deleteMany({});
    await usersCollection.insertMany(sampleUsers);

    console.log("Seeding complete successfully!");
    await client.close();
  } catch (err) {
    console.error("Seed error:", err);
    process.exit(1);
  }
}

runSeed();
