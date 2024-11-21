// controllers for sub agent routes

const debug = require('debug')('ea:ctrl-subagent');
debug.log = console.log.bind(console);
import i18next from "i18next";
import { Request, Response, NextFunction } from "express";
import { PutObjectCommand  } from "@aws-sdk/client-s3";
import multer from "multer";
import { resultModel } from "../db/models/others";
import { pollAgentModel } from "../db/models/poll-agent";
import { postResultPicturesSchema, postResultSummarySchema } from "../utils/joi";
import { saveResultFiles } from "./files";
import { s3client } from "../utils/misc";
import { RESULT_BUCKET } from "../utils/env";
import * as fs from "fs";
import * as util from "util";
import * as path from "path";


const readDirAsync = util.promisify(fs.readdir);
const readFileAsync = util.promisify(fs.readFile);

const ignoreFileList = ['.DS_Store']; // files to ignore when reading a directory


/**
 * upload pictures of Polling Station Results Documents (PSRDs)
 * @param req 
 * @param res 
 * @param next 
 */
export async function uploadResultsPictures(req: Request, res: Response, next: NextFunction) {  
    // save files using multer, also get req.body
    await saveResultFiles(req,res,next);

    // input check with Joi
    let body = req.body;
    let { error } = postResultPicturesSchema.validate(body);
    if (error) {
        debug('schema error: ', error);
        return Promise.reject({errMsg: i18next.t("request_body_error")});
    }

    // ensure poll agent is mapped to this poll station
    if (req.user?.electoralAreaId != body.electoralAreaId) {
        return Promise.reject({errmsg: i18next.t("not_assigned_elect_area")});
    }

    // create a new record, obtain the id to associate with upload, and send to poll agent
    // debug('user: ', req.user);
    let preResult = {
        electionId: body.electionId,
        partyId: req.user?.partyId,
        candidateId: req.user?.candidateId,
        uploaderId: req.user?._id,
        //filesId: req.myFileLastDir
    };
    let createRet = await resultModel.create(preResult);
    let resultId = createRet._id.toString();

    // TODO: generate on objectId before saving files, called filesId ? (save from using unix time in folder name)

    // save files in S3
    // read files in upload folder
    let files = await readDirAsync(req.myFileFullDir); // file names
    debug('files: ', files);
    let funcs = []; // functions for reading files and putting them in s3
    for (let fileName of files) {
        let filePath = path.join(req.myFileFullDir, fileName);
        funcs.push(readAndPutFile(filePath, fileName, resultId));
    }
    await Promise.all(funcs);

    // return resultId
    return { resultId };
}

/**
 * read a file from file system and put it in s3
 * @param filePath 
 * @param fileName 
 * @param resultId 
 */
async function readAndPutFile(filePath: string, fileName: string, resultId: string) {
    let fileData = await readFileAsync(filePath);
    let fileNameSplit = fileName.split('.'); // eg. '1.png' returns ['1', 'png']
    let fileNamePrefix = fileNameSplit[0]; // '1' in '1.png'
    let ext = fileNameSplit[1]; //extension 'png' in '1.png'

    //
    await s3client.send(new PutObjectCommand({
        Bucket: RESULT_BUCKET, // election group name e.g 'ghana-2024'
        Key: resultId +'_'+ fileNamePrefix,
        Body: fileData,
        ACL: 'public-read',
        Metadata: {ext}
    }));
}


/**
 * submit summary of election results, tied to pictures of PSRDs uploaded
 * @param req 
 * @param res 
 * @param next 
 */
export async function submitResultsSummary(req: Request, res: Response, next: NextFunction) {
    // input check with Joi
    let body = req.body;
    let { error } = postResultSummarySchema.validate(body);
    if (error) {
        debug('schema error: ', error);
        return Promise.reject({errMsg: i18next.t("request_body_error")});
    }

    // build result doc. // numRegisteredVoters, totalNumVotes, numRejectedVotes
    let updateObj: {[key: string]: any} = body.summary; 

    
    let filter = {_id: body.resultId};
    // iterate through .results, and divide array into parties, candidates, unknowns
    let resultUpdates: {[key: string]: any} = {}; // results.
    for (let result of body.results) {
        let key = result.partyId ? `parties.${result.partyId}` : result.candidateId ? 
        `candidates.${result.candidateId}` : `unknowns${result.name}`;
        //
        resultUpdates[key] = result;
    }
    updateObj.results = resultUpdates;

    // update result record with result summary
    await resultModel.updateOne(filter, {$set: updateObj});
}
