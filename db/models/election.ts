// Mongoose Election model

import * as mongoose from "mongoose";
const debug = require('debug')('ea:election-model');
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
    // create models for each database (by country/entity)
    for (let db of dbs) {
        if (db == auditDbName) continue;
        // setup electoralAreaModel
        electionModel = databaseConns[db].model
        <ElectionDocument, mongoose.PaginateModel<ElectionDocument> >
        ("Election", electionSchema, "Elections");
    }
}
setup();


const Schema = mongoose.Schema;
const SchemaTypes = mongoose.SchemaTypes;

// Election Schema
const electionSchema = new Schema({
    type: SchemaTypes.String,
    date: SchemaTypes.Date,
    electoralLevel: SchemaTypes.String,
    electoralAreaId: SchemaTypes.String,
    electoralAreaName: SchemaTypes.String
});

// add indexes
electionSchema.index({type: 1, date: 1});
electionSchema.index({electoralAreaId: 1});


/////////////
interface ElectionData {
    type: string,
    date: string,
    electoralLevel: string,
    electoralAreaId: string,
    electoralAreaName: string
};

// declare a mongoose document based on a Typescript interface representing your schema
interface ElectionDocument extends mongoose.Document, ElectionData {};
////////////


electionSchema.plugin(paginate);

// init electionModel to set right type. Will be updated upon db connections in setup
export let electionModel = mongoose.model<ElectionDocument, mongoose.PaginateModel<ElectionDocument> >
("Election", electionSchema, "Elections");
