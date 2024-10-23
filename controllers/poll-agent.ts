// controllers for poll-agent routes

const debug = require('debug')('ea:ctrl-pollagent');
debug.log = console.log.bind(console);
import i18next from "i18next";
import { Request, Response, NextFunction } from "express";
import { pollAgentModel } from "../db/models/poll-agent";
import { electoralAreaModel } from "../db/models/electoral-area";
import { pageLimit, getQueryNumberWithDefault, electoralLevels } from "../utils/misc";
import { putAgentElectoralAreaSchema } from "../utils/joi";
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
    let options = { page, limit: pageLimit}; // , projection

    // determine whether the user is a sub agent or a supervisor
    let supervisorId = req.user?.supervisorId; debug(`supervisorId: ${supervisorId}`);

    // supervisor
    if (!supervisorId) {
        // a supervisor. Simply return the electoral level values at this user's electoral level
        let filter = {level: req.user?.electoralLevel};
        let electAreaRet = await electoralAreaModel.paginate(filter, options);
        return {
            results: electAreaRet.docs
        };
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
    let electAreaRet = await electoralAreaModel.paginate(filter, options);

    return {
        results: electAreaRet.docs
    };
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

