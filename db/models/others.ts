// Mongoose models for collections with simple setup (no interface/pagination)

import * as mongoose from "mongoose";
const debug = require('debug')('ea:other-models');
debug.log = console.log.bind(console);
import { databaseConns, checkDatabaseConnected } from "../mongoose";
import { DBS } from "../../utils/env"


async function setup() {
    await checkDatabaseConnected();
    let dbs = DBS?.split(",") || [];
    // create models for each database (by country/entity)
    for (let db of dbs) {
        if (db == 'eaudit') continue;
        // create models
        electoralLevelsModel = databaseConns[db].model("ElectoralLevels", electoralLevelsSchema, "ElectoralLevels");

    }
}

setup();


const Schema = mongoose.Schema;
const SchemaTypes = mongoose.SchemaTypes;

// -------------------- ElectoralLevels Schema
// Singleton, always have exactly one record
const electoralLevelsSchema = new Schema({
    // name, version: {}
    levels: [
        {
            name: SchemaTypes.String, // name e.g. 'region', 'constituency'
            uid: SchemaTypes.Number
        }
    ],
    // keep track of historical levels
    oldLevels: [
        {
            name: SchemaTypes.String, // name e.g. 'region', 'constituency'
            uid: SchemaTypes.Number
        }
    ]
});


// init model. Will be updated upon db connections in 'setup'
export let electoralLevelsModel = mongoose.model("ElectoralLevels", electoralLevelsSchema, "ElectoralLevels");
// --------------------


