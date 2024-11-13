// controllers for poll-agent routes

const debug = require('debug')('ea:ctrl-pollagent');
debug.log = console.log.bind(console);
import i18next from "i18next";
import { Request, Response, NextFunction } from "express";
import { pollAgentModel } from "../db/models/poll-agent";
import { electoralAreaModel } from "../db/models/electoral-area";
import { electionModel } from "../db/models/election";
import { pageLimit, getQueryNumberWithDefault, getElectoralLevels } from "../utils/misc";
import { putAgentElectoralAreaSchema, objectIdSchema } from "../utils/joi";
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
    let { error } = await putAgentElectoralAreaSchema.validateAsync(body);
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

        // TODO: then update the StationAgentMap
    }

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
    let pollStations = req.user?.pollStations;
    let electAreaIds = [];
    if (pollStations) electAreaIds = Object.keys(pollStations);
    else electAreaIds = [req.user?.electoralAreaId];
    
    // query ElectoralAreas collection for data
    let filter = {_id: {$in: electAreaIds}};
    let electAreas = await electoralAreaModel.find(filter);
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
    let { error } = await objectIdSchema.validateAsync(req.params);
    if (error) {
        debug('schema error: ', error);
        return Promise.reject({errMsg: i18next.t("request_body_error")});
    }

    // get current electoral area record
    let electAreaId_0 = req.params.id;
    let electoralArea = await electoralAreaModel.findById(electAreaId_0);

    // step through electoral areas to find all parents
    let electoralLevels = getElectoralLevels();
    let startLevelInd = electoralLevels.findIndex((val)=> val == electoralArea?.level );
    let endLevelInd = electoralLevels.length - 1;
    // get id of electoral area, and use to search Elections collection
    let electoralAreaIds = [electAreaId_0]; // set current electoral area id electoralArea_0?._id
    let curElectAreaId = electAreaId_0;
    // ---start searching 1 level up---? since already saved current electoral area id
    // end search at endLevelInd-1 since querying parentLevelId
    for (let levelInd= startLevelInd; levelInd<= endLevelInd-1; levelInd++) {
        let electArea = await electoralAreaModel.findById(electoralArea?.parentLevelId); // curElectAreaId
        curElectAreaId = electArea?._id+'';
        electoralAreaIds.push(curElectAreaId);
    }
    debug('electoral area and parent ids: ', electoralAreaIds);

    // search Elections collection for electoralAreaId
    let filter = {electoralAreaId: {$in: electoralAreaIds}};
    let elections = await electionModel.find(filter);
    return elections;
}
