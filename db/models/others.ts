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
        partyModel = databaseConns[db].model("Party", partySchema, "Parties");
        candidateModel = databaseConns[db].model("Candidate", candidateSchema, "Candidates");
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
    results: {
        parties: new Schema({}, {strict: false}), // keyed by partyId
        candidates: new Schema({}, {strict: false}), // keyed by candidateId (independent candidate)
        unknowns: new Schema({}, {strict: false}) // unknown candidates manually entered
    },
    numRegisteredVoters: SchemaTypes.Number,
    totalNumVotes: SchemaTypes.Number,
    numRejectedVotes: SchemaTypes.Number
});

resultSchema.index({electionId: 1, partyId: 1, candidateId: 1});

// init model. Will be updated upon db connections in 'setup'
export let resultModel = mongoose.model("Results", resultSchema, "Results");

// --------------------


// // -------------------- StationAgentMap Schema
// const stationAgentMapSchema = new Schema({
//     stationId: SchemaTypes.String,
//     partyAgents: new Schema({}, {strict: false}), // agents of political parties
//     candidateAgents: new Schema({}, {strict: false}) // agents of independent candidates
// });

// stationAgentMapSchema.index({stationId: 1});

// // init model. Will be updated upon db connection in 'setup'
// export let stationAgentMapModel = mongoose.model("StationAgentMap", stationAgentMapSchema, "StationAgentMap");
// // --------------------


// -------------------- Party Schema
const partySchema = new Schema({
    name: SchemaTypes.String,
    initials: SchemaTypes.String
});

partySchema.index({initials: 1}, {unique: true});

// init model. Will be updated upon db connections in 'setup'
export let partyModel = mongoose.model("Party", partySchema, "Parties");
// --------------------


// -------------------- Candidate Schema
const candidateSchema = new Schema({
    electionId: SchemaTypes.String,
    partyId: SchemaTypes.String,
    // NB: no candidateId, it's basically _id
    surname: SchemaTypes.String,
    otherNames: SchemaTypes.String,
    title: SchemaTypes.String
});

// create a unique index for party
candidateSchema.index({electionId: 1, partyId: 1},
    {
        unique: true, //sparse: true, 
        partialFilterExpression: { partyId: {$type: 'string', $ne: ''} }
    }
);

candidateSchema.index({electionId: 1, surname: 1, otherNames: 1}, {unique: true});


// init model. Will be updated upon db connections in 'setup'
export let candidateModel = mongoose.model("Candidate", candidateSchema, "Candidates");

// --------------------
