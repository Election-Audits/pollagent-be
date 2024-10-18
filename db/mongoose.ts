// Mongoose/Mongo connection

import * as mongoose from "mongoose";
const debug = require('debug')('ea:mongoose');
debug.log = console.log.bind(console);
import { BUILD_TYPES } from "shared-lib/constants";
import { BUILD, INFISICAL_ID, INFISICAL_SECRET, INFISICAL_PROJECT_ID, NODE_ENV, 
    MONGO_LOCAL_CREDS, DBS } from "../utils/env";
import { secrets } from "../utils/infisical";
import { auditDbName } from "../utils/misc";


// set connection string depending on whether it's a local or cloud build
const protocol = (BUILD == BUILD_TYPES.local) ? 'mongodb' : 'mongodb+srv';

export let eAuditMongoUrl = ''; // general 'eaudit' db assign in setup
export let databaseConns: {[key: string]: mongoose.Connection}  = {}; // database connections


// setup steps
async function setup() {
    const mongoUrlBase = (BUILD == BUILD_TYPES.local) ? '127.0.0.1:27017' : secrets.MONGO_URL; // TODO: set cloud urls
    // mongo credentials
    const mongoCreds = (BUILD == BUILD_TYPES.local) ? MONGO_LOCAL_CREDS : 
    `${secrets.MONGO_USER}:${secrets.MONGO_PASSWORD}@`;
    // set eAuditMongoUrl value for export to utils/session
    eAuditMongoUrl = `${protocol}://${mongoCreds}${mongoUrlBase}/${auditDbName}`;
    // for each database in DBS, establish a connection
    let mongoOptions: mongoose.ConnectOptions = {};
    let dbs = DBS?.split(',') || [];
    let connectFunctions = [];
    for (let db of dbs) {
        let url = `${protocol}://${mongoCreds}${mongoUrlBase}/${db}`;
        debug('mongo url: ', url);
        connectFunctions.push(mongoose.createConnection(url));
    }
    let connectRets = await Promise.all(connectFunctions);
    // save in database connections object
    for (let ind=0; ind<dbs.length; ind++) {
        databaseConns[dbs[ind]] = connectRets[ind];
    }
    isDbConnected = true; // indicate succesful db connection
}


let isDbConnected: boolean = false;
/**
 * checks if a database connection has been established
 * @returns a Promise which resolves when database connection is established
 */
export function checkDatabaseConnected() : Promise<void> {
    return new Promise((resolve, reject)=>{
        let interval = setInterval(()=>{
            if (!isDbConnected) return;
            clearInterval(interval);
            return resolve();
        }, 1000);
    });
}

