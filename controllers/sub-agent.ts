// controllers for sub agent routes

const debug = require('debug')('ea:ctrl-subagent');
debug.log = console.log.bind(console);
import i18next from "i18next";
import { Request, Response, NextFunction } from "express";
import { S3Client, CreateBucketCommand, PutObjectCommand  } from "@aws-sdk/client-s3";
import multer from "multer";
import { resultModel } from "../db/models/others";
import { pollAgentModel } from "../db/models/poll-agent";
import { postResultPicturesSchema } from "../utils/joi";



/**
 * TODO: how to get electionId. Need endpoint to get elections for given electoral area
 * upload pictures of Polling Station Results Documents (PSRDs)
 * @param req 
 * @param res 
 * @param next 
 */
export async function uploadResultsPictures(req: Request, res: Response, next: NextFunction) {
    // input check with Joi
    let body = req.body;
    let { error } = postResultPicturesSchema.validate(body); // await. todo
    if (error) {
        debug('schema error: ', error);
        return Promise.reject({errMsg: i18next.t("request_body_error")});
    }

    // create a new record, obtain the id to associate with upload, and send to poll agent
    debug('user: ', req.user);
    let preResult = {
        electionId: body.electionId,
        partyId: req.user?.partyId,
        candidateId: req.user?.candidateId,
        uploaderId: req.user?._id
    };
    let createRet = await resultModel.create(preResult);


    // return resultId
    return { resultId: createRet._id };
}

