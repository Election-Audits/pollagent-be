// Upload of files

const debug = require('debug')('ea:ctrl-files');
debug.log = console.log.bind(console);
import multer from "multer";
import { Request, Response, NextFunction } from "express";
import i18next from "i18next";
import { filesDir, ensureDirExists } from "../utils/misc";
import * as path from "path";


const maxFileSize = 20e6; // 20 MB

// Configure multer disk storage
const storage = multer.diskStorage({
    destination: async (req, file, cb)=>{
        let dir = path.join(filesDir, req.body.electionId, req.user?._id+'', req.myFileLastDir);
        req.myFileFullDir = dir; // now set myFileFullDir to full dir path. todo: add to mongoose schema
        // ensure that directory exists
        await ensureDirExists(dir);
        cb(null, dir);
    },
    filename: (req, file, cb)=>{
        debug('filename cb. file: ', file);
        let nameParts = file.originalname.split('.');
        let ext = nameParts[nameParts.length - 1];
        let allowedExtensions = req.myAllowedExts;
        if (!allowedExtensions.includes(ext)) {
            let errMsg = i18next.t('illegal_file_extension');
            cb(new Error(errMsg), ''); // {errMsg}. todo
        }
        let fileName = file.originalname; // req.user?._id +'.'+ ext; //
        ///req.myFileName = fileName;
        return cb(null, fileName);
    }
});


/**
 * 
 * @param req 
 * @param res 
 * @param next 
 */
export async function saveResultFiles(req: Request, res: Response, next: NextFunction) {
    // set variables to be used in multer callbacks
    req.myFileLastDir = Date.now()+''; // use unix time as last subfolder
    req.myAllowedExts = ['jpg','jpeg','png'];

    // upload/save file
    await new Promise<void>((resolve, reject)=>{
        multer({storage, limits: {fileSize: maxFileSize}})
        .fields([{name: 'files'}]) //  TODO: maxCount
        (req,res, (err)=>{
            if (err) {
                debug('multer err: ', err);
                return reject(err);
            }
            //
            resolve();
        });
    });
}
