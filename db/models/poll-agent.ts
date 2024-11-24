// Polling Agent Mongoose Model

import * as mongoose from "mongoose";
const debug = require('debug')('ea:pollagent-model');
debug.log = console.log.bind(console);
import { databaseConns, checkDatabaseConnected, auditDbName } from "../mongoose";
import { DBS } from "../../utils/env"
import paginate from "mongoose-paginate-v2";


/*
check db connection, then create model using db connection
*/
async function setup() {
    await checkDatabaseConnected();
    let dbs = DBS?.split(",") || [];
    // set up poll agent on audit db only
    for (let db of dbs) {
        if (db != auditDbName) continue;
        // audit db
        // setup PollAgents model on eaudit* database
        pollAgentModel = databaseConns[db].model<PollAgentDocument, mongoose.PaginateModel<PollAgentDocument> >
        ("PollAgent", pollAgentSchema, "PollAgents");
    }
}
setup();


const Schema = mongoose.Schema;
const SchemaTypes = mongoose.SchemaTypes;



// Poll Agent schema
const pollAgentSchema = new Schema({
    surname: SchemaTypes.String,
    otherNames: SchemaTypes.String,
    email: {
        type: SchemaTypes.String,
        //unique: true,
        index: {
            unique: true,
            partialFilterExpression: { email: { $type: 'string' } },
        },
        sparse: true
    },
    phone: SchemaTypes.String,
    password: SchemaTypes.String,
    otpCodes: [
        { code: SchemaTypes.String, createdAtms: SchemaTypes.Number }
    ],
    emailConfirmed: SchemaTypes.Boolean,
    phoneConfirmed: SchemaTypes.Boolean,
    //
    supervisorId: SchemaTypes.String, // id of supervisor
    // NB: subAgentsRef (not needed since can query Supervisors collection by agentId)
    // subAgentsRef: SchemaTypes.String, // reference to subAgents/supervisees document. 
    //
    electoralLevel: SchemaTypes.String,
    electoralAreaId: SchemaTypes.String,
    electoralAreaName: SchemaTypes.String,
    //
    partyId: SchemaTypes.String,
    candidateId: SchemaTypes.String, // for independent candidates without parties
    country: SchemaTypes.String,
    // pollStations keyed by pollStation id and with value {name, id}
    pollStations: new Schema({}, {strict: false})
});

// pollAgentSchema.index({email: 1}, 
//     {unique: true, partialFilterExpression: {email: {$exists: true, $gt: ''}} }
// );

////////////////////
interface PollAgentData {
    surname: string,
    otherNames: string,
    email: {
        type: string,
        unique: true
    },
    phone: string,
    password: string,
    otpCodes: [
        { code: string, createdAtms: number }
    ],
    emailConfirmed: boolean,
    phoneConfirmed: boolean,
    //
    supervisorId: string, // id of supervisor
    subAgentsRef: string, // reference to subAgents/supervisees document
    //
    electoralLevel: string,
    electoralAreaId: string, // NB: only lowest level agent can have multiple in pollStations field
    electoralAreaName: string,
    //
    partyId: string,
    country: string,
    pollStations: object
};


// declare a mongoose document based on a Typescript interface representing your schema
interface PollAgentDocument extends mongoose.Document, PollAgentData {}

////////////////////

pollAgentSchema.plugin(paginate); // use paginate plugin

// init pollAgentModel to set right type. Will be updated upon db connections in setup
export let pollAgentModel = mongoose.model<PollAgentDocument, mongoose.PaginateModel<PollAgentDocument> >
("PollAgent", pollAgentSchema, "PollAgents");

