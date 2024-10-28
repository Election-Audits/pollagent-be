// Mongoose/Mongo connection

import * as mongoose from "mongoose";
const debug = require('debug')('ea:mongoose');
debug.log = console.log.bind(console);
import { BUILD_TYPES } from "shared-lib/constants";
import { BUILD, INFISICAL_ID, INFISICAL_SECRET, INFISICAL_PROJECT_ID, NODE_ENV, 
    MONGO_LOCAL_CREDS, DBS } from "../utils/env";
import { secrets, checkSecretsReturned } from "../utils/infisical";


// set connection string depending on whether it's a local or cloud build
const protocol = (BUILD == BUILD_TYPES.local) ? 'mongodb' : 'mongodb+srv';

export let eAuditMongoUrl = ''; // general 'eaudit' db assign in setup
export let databaseConns: {[key: string]: mongoose.Connection}  = {}; // database connections


// audit db holds User and session collections. Either eaudit, 'eaudit-test',...
let dbs = DBS?.split(',') || [];
export const auditDbName = dbs.find((db)=> db.startsWith('eaudit'));
debug('auditDbName: ', auditDbName);


// setup steps
async function setup() {
    await checkSecretsReturned();
    const mongoUrlBase = (BUILD == BUILD_TYPES.local) ? '127.0.0.1:27017' : secrets.MONGO_URL;
    // mongo credentials
    const mongoCreds = (BUILD == BUILD_TYPES.local) ? MONGO_LOCAL_CREDS : 
    `${secrets.MONGO_USER}:${secrets.MONGO_PASSWORD}@`;
    // set eAuditMongoUrl value for export to utils/session
    eAuditMongoUrl = `${protocol}://${mongoCreds}${mongoUrlBase}/${auditDbName}`;
    // for each database in DBS, establish a connection
    // let mongoOptions: mongoose.ConnectOptions = {};
    let dbs = DBS?.split(',') || [];
    let connectFunctions = [];
    for (let db of dbs) {
        let url = `${protocol}://${mongoCreds}${mongoUrlBase}/${db}?retryWrites=true&w=majority&appName=Cluster0`; //   
        // debug('db to connect: ', db);
        connectFunctions.push(mongoose.createConnection(url));
    }
    let connectRets = await Promise.all(connectFunctions);
    // save in database connections object
    for (let ind=0; ind<dbs.length; ind++) {
        databaseConns[dbs[ind]] = connectRets[ind];
    }
    isDbConnected = true; // indicate succesful db connection
}

setup();


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

// -------------------- End (Mongoose setup) --------------------------



/**
 * Tries to insert a document to the database, if it fails bc record already exists, 
 * would then try to update the existing record with the 'fieldsUpdate'
 * @param model 
 * @param fieldsUnique unique fields of model 
 * @param fieldsUpdate other fields to be used for update if record already exists
 * @returns 
 */
export async function tryInsertUpdate(model: mongoose.Model<any>, fieldsUnique: {[key: string]: any}, 
    fieldsUpdate: {[key: string]: any}) {
    // first try to insert
    let allFields = {...fieldsUnique, ...fieldsUpdate};
    try {
        await model.create(allFields);
    } catch (exc: any) {
        debug('modle create exc: ', exc);
        // check if the failure is due to a repeat of unique fields
        if (exc?.code === 11000) {
            // insert failed bc record exists, update 'update' fields only
            await model.updateOne(fieldsUnique, {$set: fieldsUpdate});
        } else {
            return Promise.reject(exc);
        }
    }
}


