const express = require('express');
const cors = require('cors');
require('dotenv').config()
// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;


app.use(cors());              
app.use(express.json()); 


// Root route for testing server
app.get("/", (req, res) => {
    res.send("Zap Shift Server is going on");
})


// ===================== SERVER LISTEN ===================== //
app.listen(port, () => {
    console.log(`Zap Shift Server at port: ${port}`)
});