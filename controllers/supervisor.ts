// controllers for supervisor routes

const debug = require('debug')('ea:ctrl-supervisor');
debug.log = console.log.bind(console);
import i18next from "i18next";
import { Request, Response, NextFunction } from "express";
import { postSubAgentsSchema } from "../utils/joi";
import { pollAgentModel } from "../db/models/poll-agent";
import { supervisorModel } from "../db/models/others";
import { electoralLevels } from "../utils/misc";
import { tryInsertUpdate } from "../db/mongoose";



/**
 * Add sub agents
 * @param req 
 * @param res 
 * @param next 
 */
export async function postSubAgents(req: Request, res: Response, next: NextFunction) {
    // validate inputs with Joi
    let body = req.body;
    let { error } = postSubAgentsSchema.validate(body); // await. todo
    if (error) {
        debug('schema error: ', error);
        return Promise.reject({errMsg: i18next.t("request_body_error")});
    }

    // add subagents to Supervisors collection
    // iterate body.people and build objects for updating Supervisors
    let subAgentsObj: {[key: string]: boolean} = {};
    for (let subAgent of body.people) {
        let field = `subAgents.${subAgent.phone}`;
        subAgentsObj[field] = true;
    }
    //
    let filter = { agentId: req.user?._id };
    await supervisorModel.updateOne(filter, {$set: subAgentsObj}); // add subAgents
    
    // ensure electoral levels are valid
    let myElectLevel = req.user?.electoralLevel;
    let myLevelInd = electoralLevels.findIndex((x)=> x==myElectLevel );
    if (myLevelInd == -1) {
        return Promise.reject(`user has electoral level outside available levels: ${myElectLevel}`);
    }
    let subElectLevel = electoralLevels[myLevelInd+1]; // electoral level of sub Agents
    if (!subElectLevel) {
        return Promise.reject(`subAgents would have electoral level outside available levels`);
    }

    // update records in PollAgents collection to allow signup/login of subAgent
    // fill out agentsArray for writing to PollAgents collection
    // let agentsArray = [];
    // let phoneArray = [];
    let dbFuncs = []; // mongoose functions
    for (let subAgent of body.people) {
        //phoneArray.push(subAgent.phone);
        // agent update object
        let agentUpdate : {[key: string]: any} = {
            supervisorId: req.user?._id,
            electoralLevel: subElectLevel
        };
        if (subAgent.surname) agentUpdate.surname = subAgent.surname;
        if (subAgent.otherNames) agentUpdate.otherNames = subAgent.otherNames;
        //agentsArray.push(agentUpdate);
        //let filter = {phone: subAgent.phone};
        //dbFuncs.push( pollAgentModel.updateOne(filter, {$set: subAgent}) )
        let fieldsUnique = {phone: subAgent.phone};
        let fieldsUpdate = agentUpdate;
        dbFuncs.push( tryInsertUpdate(pollAgentModel, fieldsUnique, fieldsUpdate) );
    }
    //
    await Promise.all(dbFuncs);

    //write to PollAgents
    //let updateFilter = {phone: {$in: phoneArray}};
    //await pollAgentModel.updateMany(updateFilter, )
}


