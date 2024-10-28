// Mongoose models for collections with simple setup (no interface/pagination)

import * as mongoose from "mongoose";
const debug = require('debug')('ea:other-models');
debug.log = console.log.bind(console);
import { databaseConns, checkDatabaseConnected, auditDbName } from "../mongoose";
import { DBS } from "../../utils/env"


async function setup() {
    await checkDatabaseConnected();
    let dbs = DBS?.split(",") || [];
    // create models for each database (by country/entity)
    for (let db of dbs) {
        if (db == auditDbName) continue;
        // create models
        electoralLevelsModel = databaseConns[db].model("ElectoralLevels", electoralLevelsSchema, "ElectoralLevels");
        supervisorModel = databaseConns[db].model("Supervisors", supervisorSchema, "Supervisors");
        resultModel = databaseConns[db].model("Results", resultSchema, "Results");
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


// -------------------- Supervisors Schema
const supervisorSchema = new Schema({
    agentId: SchemaTypes.String,
    subAgents: {

    }
});

supervisorSchema.index({agentId: 1}, {unique: true});

// init model. Will be updated upon db connections in 'setup'
export let supervisorModel = mongoose.model("Supervisors", supervisorSchema, "Supervisors");
// --------------------


// -------------------- Results Schema
const resultSchema = new Schema({
    electionId: SchemaTypes.String, // election these results belong to
    partyId: SchemaTypes.String, // party id of uploader
    candidateId: SchemaTypes.String, // candidate id of uploader
    uploaderId: SchemaTypes.String, // id of poll agent
    results: new Schema({ // keyed by partyId or candidateId

    }, {strict: false})
});

resultSchema.index({electionId: 1, partyId: 1, candidateId: 1});

// init model. Will be updated upon db connections in 'setup'
export let resultModel = mongoose.model("Results", resultSchema, "Results");

// --------------------

