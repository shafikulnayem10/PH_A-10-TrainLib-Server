const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config({ path: __dirname + '/.env' });

const app = express();
const port = process.env.PORT || 5000;

// CORS Middleware
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

async function run() {
    try {
        await client.connect(); 
        console.log("Successfully connected to MongoDB Atlas!");

        const db = client.db(process.env.AUTH_DB_NAME || "trainlibDB");
        classesCollection = db.collection("classes");
      
      
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


app.get('/', (req, res) => {
    res.send('TrainLib Server is running...');
});

// Server Listen
app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
    console.log(`Localhost Link: http://localhost:${port}`); 
});