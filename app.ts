import * as path from "path";
// NB: can set DOTENV_CONFIG_PATH env, otherwise defaults to ./envs/.env
process.env.DOTENV_CONFIG_PATH ||= path.join(__dirname, "envs", ".env");
import "dotenv/config";

import express from "express";
const debug = require('debug')('ea:app');
debug.log = console.log.bind(console);
import "./auth"; // passport setup
import passport from "passport";



const app = express();
const port = process.env.PORT || 3011;
app.listen(port, ()=>{
    debug('starting at: ', new Date());
    console.log(`app is listening on port ${port}`);
});


// a ping to check if app is running
app.get('/ping', (req,res,next)=>{
    res.send("App (Polling Agent) is running");
});


app.use(passport.initialize()); // initialize passport

// mount routers





// TODO: error handler
