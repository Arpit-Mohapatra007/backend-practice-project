import dotenv from "dotenv"
import connectDB from "./db/index.js";

dotenv.config({
    path: './env'
})

connectDB()
    .then(()=>{
        app.listen(process.env.PORT || 8000,()=>{
            console.log(`Server live at http://localhost:${process.env.PORT}...`);
        })
    })
        .catch((error)=>{
            console.error("DB CONNECTION FAILED:",error)
        })























/*
import express from "express"
const app = express()
;(async ()=>{
    try {
        await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`)
        app.on("error",(error)=>{
            console.log("ERROR:",error)
            throw error
        })
        app.listen(process.env.PORT,()=>{
            console.log(`Server live at: http://localhost:${process.env.PORT}`)
        })
    } catch (error) {
        console.error("ERROR:",error)
        throw error
    }
})()
    */

