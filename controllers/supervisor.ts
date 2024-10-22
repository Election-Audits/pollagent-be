// controllers for supervisor routes

const debug = require('debug')('ea:ctrl-supervisor');
debug.log = console.log.bind(console);
import i18next from "i18next";
import { Request, Response, NextFunction } from "express";
import { postSubAgentsSchema, getOneSubAgentSchema } from "../utils/joi";
import { pollAgentModel } from "../db/models/poll-agent";
import { supervisorModel } from "../db/models/others";
import { electoralLevels, verifyWindow } from "../utils/misc";
import { tryInsertUpdate } from "../db/mongoose";

// ES Module import
let randomString : Function;
import('crypto-random-string').then((importRet)=>{
    randomString = importRet.default;
});

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
    let dbFuncs = []; // mongoose functions
    for (let subAgent of body.people) {
        // agent update object
        let agentUpdate : {[key: string]: any} = {
            supervisorId: req.user?._id,
            electoralLevel: subElectLevel
        };
        if (subAgent.surname) agentUpdate.surname = subAgent.surname;
        if (subAgent.otherNames) agentUpdate.otherNames = subAgent.otherNames;
        //
        let fieldsUnique = {phone: subAgent.phone};
        let fieldsUpdate = agentUpdate;
        dbFuncs.push( tryInsertUpdate(pollAgentModel, fieldsUnique, fieldsUpdate) );
    }
    //
    await Promise.all(dbFuncs);
}


/**
 * Get a supervisor's sub agents
 * @param req 
 * @param res 
 * @param next 
 */
export async function getSubAgents(req: Request, res: Response, next: NextFunction) {
    // no inputs
    let user = req.user;
    // query Supervisors collection with agentId == _id
    let supervisorRec = await supervisorModel.findOne({agentId: user?._id});
    let subAgentsObj = supervisorRec?.subAgents;
    let subPhones = Object.keys(subAgentsObj);

    // get personal data of subAgents
    let filter = {phone: {$in: subPhones}};
    let projection = {surname: 1, otherNames: 1, phone: 1, email: 1, electoralAreaName: 1};
    let subAgentsRet = await pollAgentModel.find(filter, projection);
    return subAgentsRet;
}


/**
 * Get a specific sub agent
 * @param req 
 * @param res 
 * @param next 
 */
export async function getOneSubAgent(req: Request, res: Response, next: NextFunction) {
    // validate inputs with Joi
    let { error } = getOneSubAgentSchema.validate(req.params);
    if (error) {
        debug('schema error: ', error);
        return Promise.reject({errMsg: i18next.t("request_body_error")});
    }

    // get supervisor record
    let user = req.user;
    let supervisorRec = await supervisorModel.findOne({agentId: user?._id});
    // ensure that this subagent is assigned to this supervisor
    let subAgentPhone = req.params.phone;
    if (!supervisorRec?.subAgents[subAgentPhone]) {
        return Promise.reject({errMsg: i18next.t('user_not_subagent')});
    }

    // get subAgent'srecord
    let projection = {surname: 1, otherNames: 1, phone: 1, email: 1, electoralAreaName: 1};
    let subAgentRec = await pollAgentModel.findOne({phone: subAgentPhone}, projection);
    return subAgentRec;
}


/**
 * Get an OTP for a sub agent
 * @param req 
 * @param res 
 * @param next 
 */
export async function getSubAgentCode(req: Request, res: Response, next: NextFunction) {
    // validate inputs with Joi. NB: uses phone param just like getOneSubAgent
    let { error } = getOneSubAgentSchema.validate(req.params);
    if (error) {
        debug('schema error: ', error);
        return Promise.reject({errMsg: i18next.t("request_body_error")});
    }

    // get supervisor record
    let user = req.user;
    let supervisorRec = await supervisorModel.findOne({agentId: user?._id});
    // ensure that this subagent is assigned to this supervisor
    let subAgentPhone = req.params.phone;
    if (!supervisorRec?.subAgents[subAgentPhone]) {
        return Promise.reject({errMsg: i18next.t('user_not_subagent')});
    }

    // generate a code, save in sub agent's record
    let code = randomString({length: 4, type: 'numeric'});
    // get subAgent record to process otpCodes
    let subAgentRecord = await pollAgentModel.findOne({phone: subAgentPhone});
    if (!subAgentRecord) {
        return Promise.reject({errMsg: i18next.t('entity_not_exist')});
    }
    let otpCodes_0 = subAgentRecord.otpCodes || [];
    let otpCodes = [...otpCodes_0, {code, createdAtms: Date.now()}];
    // remove otp codes that are too old
    otpCodes = otpCodes.filter((x: any)=>{
        let codeAge = Date.now() - x.createdAtms;
        return codeAge < 2*verifyWindow;
    });
    
    // update subAgent record otp codes
    await pollAgentModel.updateOne({phone: subAgentPhone}, {$set: {otpCodes}});

    // send code to supervisor
    return { code };
}

