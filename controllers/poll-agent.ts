// controllers for poll-agent routes

const debug = require('debug')('ea:ctrl-pollagent');
debug.log = console.log.bind(console);
import i18next from "i18next";
import { Request, Response, NextFunction } from "express";
import { pollAgentModel } from "../db/models/poll-agent";
import { electoralAreaModel } from "../db/models/electoral-area";
import { electionModel } from "../db/models/election";
import { candidateModel, partyModel } from "../db/models/others";
// import { stationAgentMapModel } from "../db/models/others";
import { pageLimit, getQueryNumberWithDefault, getElectoralLevels } from "../utils/misc";
import { putAgentElectoralAreaSchema, objectIdSchema, getCandidatesSchema } from "../utils/joi";
// import { Types as mongooseTypes } from "mongoose";



/**
 * get electoral area choices available to be chosen by a polling agent
 * @param req 
 * @param res 
 * @param next 
 */
export async function getElectoralAreaChoices(req: Request, res: Response, next: NextFunction) {
    // NB: req.query.pg ensured to be a number by getQueryNumberWithDefault below

    // ensure that query.pg is a number. 
    let page = getQueryNumberWithDefault(req.query?.pg); // get page from query or start with 1
    debug(`page: ${page}`);
    let options = { page, limit: pageLimit}; // , projection

    // determine whether the user is a sub agent or a supervisor
    let supervisorId = req.user?.supervisorId; debug(`supervisorId: ${supervisorId}`);

    // supervisor
    if (!supervisorId) {
        // a supervisor. Simply return the electoral level values at this user's electoral level
        let filter = {level: req.user?.electoralLevel};
        let electAreaRet = await electoralAreaModel.find(filter); //.paginate(filter, options);
        debug('electoral area choices: ', electAreaRet);
        return electAreaRet; // .docs
    }

    // user is subAgent
    // get supervisor, get electoralAreaId and find all electoral areas with this parentLevelId
    let projection = {password: 0}; //{electoralAreaId: 1};
    let supervisorRec = await pollAgentModel.findById(supervisorId, {projection});
    debug('supervisorRec: ', JSON.stringify(supervisorRec));
    let supervisorElectAreaId = supervisorRec?.electoralAreaId;
    if (!supervisorElectAreaId) {
        return Promise.reject(`parent electoralAreaId not set for parent: ${supervisorId}`);
    }

    // get relevant page of data
    let filter = {parentLevelId: supervisorRec?.electoralAreaId};
    let electAreaRet = await electoralAreaModel.find(filter); //.paginate(filter, options);

    debug('electoral area choices: ', electAreaRet);
    return electAreaRet; // results:
}


/**
 * Assign an electoral area (eg. polling station) to a polling agent
 * @param req 
 * @param res 
 * @param next 
 */
export async function assignAgentElectoralArea(req: Request, res: Response, next: NextFunction) {
    // Joi input check
    let body = req.body;
    let { error } = putAgentElectoralAreaSchema.validate(body);
    if (error) {
        debug('schema error: ', error);
        return Promise.reject({errMsg: i18next.t("request_body_error")});
    }

    // obtain details of electoral area
    let electoralArea = await electoralAreaModel.findById(body.electoralAreaId);

    // if supervisor exists, must pick an electoral area such that parentLevelId == supervisor.electoralAreaId
    let supervisorId = req.user?.supervisorId
    if (supervisorId) {
        let projection = {electoralAreaId: 1};
        let supervisorRet = await pollAgentModel.findById(supervisorId, projection);
        // debug('supervisorRet: ', supervisorRet);
        if (electoralArea?.parentLevelId !== supervisorRet?.electoralAreaId) {
            return Promise.reject(`electoral area outside supervisor's area`); // ${electoralArea?.level}
        }
    }

    // set electoralAreaId and electoralAreaName. If a polling station, add to pollingStations field
    let updateFields: {[key:string]: any} = {
        electoralAreaId: body.electoralAreaId,
        electoralAreaName: electoralArea?.name
    };

    // if agent is at lowest level, ie polling station, set polling station fields
    let electoralLevels = getElectoralLevels();
    let levelInd = electoralLevels.findIndex((lvl)=> lvl == req.user?.electoralLevel);
    if (levelInd == electoralLevels.length-1) { // lowest level, polling station agent
        updateFields[`pollStations.${body.electoralAreaId}`] = {
            name: electoralArea?.name,
            id: electoralArea?._id
        }

        // // update the StationAgentMap to map polling station to this agent
        // let filter = {_id: body.electoralAreaId};
        // let partyId = req.user?.partyId;
        // let candidateId = req.user?.candidateId;
        // let agentMapUpdate = partyId ? `partyAgents.${partyId}` : `candidateAgents.${candidateId}`;
        // let agentUpdateObject = {$set: {[agentMapUpdate]: req.user?._id.toString()}}
        // await stationAgentMapModel.updateOne(filter, agentUpdateObject, {upsert: true});
    }

    // update the electoral Area to set partyAgents[id] or candidateAgents[id] to this user
    let filterElectArea = {_id: body.electoralAreaId};
    let partyId = req.user?.partyId;
    let candidateId = req.user?.candidateId;
    let electAreaUpdate = partyId ? `partyAgents.${partyId}` : `candidateAgents.${candidateId}`;
    let updateCommand = {$set: {[electAreaUpdate]: req.user?._id.toString()} };
    await electoralAreaModel.updateOne(filterElectArea, updateCommand);

    // update Poll Agent record
    let filter = {_id: req.user?._id}; // mongooseTypes.ObjectId()
    await pollAgentModel.updateOne(filter, {$set: updateFields});
}


/**
 * 
 * @param req 
 * @param res 
 * @param next 
 */
export async function getAgentElectoralAreas(req: Request, res: Response, next: NextFunction) {
    // for lowest electoral level, saved in pollStations nested object, for others saved in electoralAreaId
    let pollStations = req.user?.pollStations; // debug('pollStations: ', pollStations);
    let electAreaIds = [];
    if (pollStations) {
        electAreaIds = Object.keys(pollStations);
        // contains weird keys like $__parent, $isNew,...
        electAreaIds = electAreaIds.filter((id)=> id.length == 24); // mongo object id have length 24
    } else {
        electAreaIds = [req.user?.electoralAreaId];
    }
    debug('electAreaIds: ', electAreaIds);
    
    // query ElectoralAreas collection for data
    let filter = {_id: {$in: electAreaIds}};
    let projection = {partyAgents: 0, candidateAgents: 0};
    let electAreas = await electoralAreaModel.find(filter, projection);
    return electAreas;
}


/**
 * GET upcoming elections for this electoral area and its parents
 * @param req 
 * @param res 
 * @param next 
 */
export async function getElectoralAreaParentElections(req: Request, res: Response, next: NextFunction) {
    // Joi input check
    let { error } = objectIdSchema.validate(req.params);
    if (error) {
        debug('schema error: ', error);
        return Promise.reject({errMsg: i18next.t("request_body_error")});
    }

    // get current electoral area record
    let electAreaId_0 = req.params.id;
    let electoralArea: {[key: string]: any} | null = await electoralAreaModel.findById(electAreaId_0);

    // step through electoral areas to find all parents
    let electoralLevels = getElectoralLevels();
    let startLevelInd = electoralLevels.findIndex((val)=> val == electoralArea?.level );
    let endLevelInd = 0; // end at highest level/country
    // debug(`startLevelInd: ${startLevelInd}, endLevelInd: ${endLevelInd}`);
    // get id of electoral area, and use to search Elections collection
    let electoralAreaIds = [electAreaId_0]; // set current electoral area id electoralArea_0?._id
    let curElectAreaId = electAreaId_0;

    // NB: startLevelInd > endLevelInd, searching from right to left (child to parent)
    for (let levelInd= startLevelInd; levelInd>= endLevelInd; levelInd--) {
        let electArea : {[key: string]: any} | null = await electoralAreaModel.findById(electoralArea?.parentLevelId);
        curElectAreaId = electArea?._id.toString(); //debug('curElectAreaId: ', curElectAreaId);
        if (curElectAreaId) electoralAreaIds.push(curElectAreaId);
        electoralArea = electArea; // set to parent electArea
    }
    debug('electoral area and parent ids: ', electoralAreaIds);

    // search Elections collection for electoralAreaId
    let filter = {electoralAreaId: {$in: electoralAreaIds}};
    let elections = await electionModel.find(filter);
    // debug('elections: ', elections);
    return elections;
}


/**
 * Get candidates of an election
 * @param req 
 * @param res 
 * @param next 
 */
export async function getCandidates(req: Request, res: Response, next: NextFunction) {
    // Joi input check for query
    let { error } = await getCandidatesSchema.validateAsync(req.query);
    if (error) {
        debug('schema error: ', error);
        return Promise.reject({errMsg: i18next.t("request_body_error")});
    }

    // get candidates. use electionId and filter query params
    let { electionId, filter } = req.query;
    let filterDb: {[key: string]: any} = { electionId };
    if (filter == 'ind') filterDb.partyId = "";
    let candidates = await candidateModel.find(filterDb);
    candidates = candidates.map((x: {[key: string]: any})=> x._doc); // find returning object with {_doc, $isNew, ...}

    // Ensure all expected fields in Dart are populated: partyName, partyInitials
    let getFuncs = [];
    for (let candidate of candidates) {
        //let noPartyData = {partyId: '', partyInitials: '', partyName: ''}; // party data for independent candidates
        let noPartyData = {_id: '', name: '', initials: ''};
        let func = candidate.partyId ? partyModel.findById(candidate.partyId) : Promise.resolve(noPartyData);
        getFuncs.push(func);
    }

    // combine party data with candiate data
    let partyRet = await Promise.all(getFuncs);
    let retData = [];
    for (let ind=0; ind<candidates.length; ind++) {
        let partyInfo  = partyRet[ind]; //?._doc || partyRet[ind];
        let party = {
            partyId: partyInfo?._id ? partyInfo?._id.toString() : '',
            partyInitials: partyInfo?.initials,
            partyName: partyInfo?.name
        };
        let candidate = candidates[ind];
        let data = {...candidate, ...party};
        retData.push(data);
    }

    debug('candidates: ', retData);
    return retData; // [ {surname, otherNames, partyId, partyName, partyInitials}, ...]
}
