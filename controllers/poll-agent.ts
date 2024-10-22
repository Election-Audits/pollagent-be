// controllers for poll-agent routes

const debug = require('debug')('ea:ctrl-pollagent');
debug.log = console.log.bind(console);
import i18next from "i18next";
import { Request, Response, NextFunction } from "express";
import { pollAgentModel } from "../db/models/poll-agent";
import { electoralAreaModel } from "../db/models/electoral-area";
import { pageLimit, getQueryNumberWithDefault } from "../utils/misc";



/**
 * get electoral area choices available to be chosen by a polling agent
 * @param req 
 * @param res 
 * @param next 
 */
export async function getElectoralAreaChoices(req: Request, res: Response, next: NextFunction) {
    // NB: req.query.pg ensured to be a number by getQueryNumberWithDefault below 

    // get supervisor, get electoralAreaId and find all electoral areas with this parentLevelId
    let supervisorId = req.user?.supervisorId;
    let projection = {password: 0}; //{electoralAreaId: 1};
    let supervisorRec = await pollAgentModel.findById(supervisorId, {projection});
    debug('supervisorRec: ', supervisorRec);
    let supervisorElectAreaId = supervisorRec?.electoralAreaId;
    if (!supervisorElectAreaId) {
        return Promise.reject(`parent electoralAreaId not set for parent: ${supervisorId}`);
    }

    // ensure that query.pg is a number. 
    let page = getQueryNumberWithDefault(req.query?.pg); // get page from query or start with 1
    let options = { page, limit: pageLimit}; // , projection
    let filter = {parentLevelId: supervisorRec?.electoralAreaId};
    let electoralAreas = await electoralAreaModel.paginate(filter, options);

    return {
        results: electoralAreas.docs
    };
}

