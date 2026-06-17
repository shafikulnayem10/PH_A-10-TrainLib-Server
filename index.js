const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

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

async function run() {
    try {
        
        await client.connect(); 
        console.log("Successfully connected to MongoDB Atlas!");

        const db = client.db(process.env.AUTH_DB_NAME);
        const testCollection = db.collection("testData");
       

        
        app.get('/', (req, res) => {
            res.send('TrainLib Server is running...');
        });
      await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

       

    } finally {
       
    }
}
run().catch(console.dir);

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
    console.log(`Localhost Link: http://localhost:${port}`); 
});