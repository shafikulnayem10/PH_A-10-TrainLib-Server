const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config({ path: __dirname + '/.env' });

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
    origin: ['http://localhost:3000'], 
    credentials: true
}));
app.use(express.json());

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

let classesCollection;
let postsCollection;
let bookingsCollection;
let favoritesCollection;

async function run() {
    try {
        await client.connect(); 
        console.log("Successfully connected to MongoDB Atlas!");

        const db = client.db(process.env.AUTH_DB_NAME || "trainlibDB");
        
        classesCollection = db.collection("classes");
        postsCollection = db.collection("posts"); 
        bookingsCollection = db.collection("bookings");
        favoritesCollection = db.collection("favorites");
      
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

    } catch (error) {
        console.error("MongoDB Connection Error:", error);
    }
}
run().catch(console.dir);

app.get('/featured-classes', async (req, res) => {
    try {
        if (!classesCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }

        const result = await classesCollection
            .find()
            .sort({ bookingCount: -1 }) 
            .limit(6)
            .toArray();
            
        res.send(result);
    } catch (error) {
        console.error("Error fetching featured classes:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});

app.get('/latest-posts', async (req, res) => {
    try {
        if (!postsCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }

        const result = await postsCollection
            .find()
            .sort({ createdAt: -1 })
            .limit(4)
            .toArray();

        res.send(result);
    } catch (error) {
        console.error("Error fetching latest forum posts:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});

app.get('/all-classes', async (req, res) => {
    try {
        if (!classesCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }

        const { search, category, page, perPage } = req.query;
        
        // Enforce the requirement: Only display approved classes
        let query = { status: "approved" }; 

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { className: { $regex: search, $options: 'i' } }
            ];
        }

        if (category && category !== 'All') {
            query.category = category;
        }

        if (page) {
            const currentPage = parseInt(page, 10) || 1;
            const limitItems = parseInt(perPage, 10) || 12;
            const skipItems = (currentPage - 1) * limitItems;

            const total = await classesCollection.countDocuments(query);
            const classes = await classesCollection.find(query).skip(skipItems).limit(limitItems).toArray();

            return res.send({ total, classes });
        }

        const total = await classesCollection.countDocuments(query);
        const classes = await classesCollection.find(query).toArray();
        res.send({ total, classes });

    } catch (error) {
        console.error("Error fetching all classes:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});
app.get('/api/classes/:id', async (req, res) => {
    try {
        if (!classesCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }
        const id = req.params.id;
        const result = await classesCollection.findOne({ _id: new ObjectId(id) });
        if (!result) {
            return res.status(404).send({ message: "Class not found" });
        }
        res.send(result);
    } catch (error) {
        console.error("Error fetching class details:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});
app.get('/api/bookings/check', async (req, res) => {
    try {
        if (!bookingsCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }
        const { classId, email } = req.query;
        const alreadyBooked = await bookingsCollection.findOne({ classId, userEmail: email });
        res.send({ isBooked: !!alreadyBooked });
    } catch (error) {
        console.error("Error checking booking status:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});
app.post('/api/favorites', async (req, res) => {
    try {
        if (!favoritesCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }
        const favoriteData = req.body;
        const exists = await favoritesCollection.findOne({ 
            classId: favoriteData.classId, 
            userEmail: favoriteData.userEmail 
        });

        if (exists) {
            return res.status(400).send({ message: "Already added to favorites" });
        }

        const result = await favoritesCollection.insertOne(favoriteData);
        res.send(result);
    } catch (error) {
        console.error("Error adding to favorites:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});
app.get('/', (req, res) => {
    res.send('TrainLib Server is running...');
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
    console.log(`Localhost Link: http://localhost:${port}`); 
});