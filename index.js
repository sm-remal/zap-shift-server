const express = require('express');
const cors = require('cors');
require('dotenv').config()
const { MongoClient, ServerApiVersion } = require('mongodb');
// ========= Initialize Express app ========= //
const app = express();
const port = process.env.PORT || 3000;


app.use(cors());              
app.use(express.json()); 

// ========== MONGODB CONNECTION ========== //
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@clustersm.e6uuj86.mongodb.net/?appName=ClusterSM`;

// ========== Create MongoDB client instance ========= //
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// ========= Connection set function ========== //
async function run() {
  try {
    await client.connect();

    // ========== MAIN FUNCTION ========== //

    const db = client.db("zap_shift_db");
    const parcelCollection = db.collection("parcels");

    // ========== Parcel Related API ======== //
    app.get("/parcels", async(req, res) => {

    })

    app.post("/parcels", async(req, res) => {
        const parcel = req.body;
        const result = await parcelCollection.insertOne(parcel);
        res.send(result);
    })


    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    
    // await client.close();
  }
}
run().catch(console.dir);

// ========== Root route for testing server ========== //
app.get("/", (req, res) => {
    res.send("Zap Shift Server is going on");
})


// ========== SERVER LISTEN ========== //
app.listen(port, () => {
    console.log(`Zap Shift Server at port: ${port}`)
});
