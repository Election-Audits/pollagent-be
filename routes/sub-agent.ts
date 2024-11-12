// routes for sub agent specific routes

const debug = require('debug')('ea:rte-subagent');
debug.log = console.log.bind(console);
import * as express from "express";
import { endpointError } from "shared-lib/backend/misc";
import passport from "passport";
import { COOKIE_SECRET as cookieSecretEnv, BUILD } from "../utils/env";
import cookieParser from "cookie-parser";
import { secrets , checkSecretsReturned } from "../utils/infisical";
import { BUILD_TYPES } from "shared-lib/constants";
import { pollAgentSession } from "../utils/session";
import { uploadResultsPictures } from "../controllers/sub-agent";
import multer from "multer";



const router = express.Router();

export default router;

router.use(express.json());

let cookieSecret = cookieSecretEnv +'';

router.use(cookieParser(cookieSecret));
router.use((req,res,next)=> pollAgentSession(req,res,next));



/*
Upload pictures of Polling Station Results Document (PSRDs)
*/
router.post('/results/pictures',
passport.authenticate('subagent-cookie', {session: false}),
(req,res,next)=>{
    debug('received request to /results/upload');
    uploadResultsPictures(req,res,next)
    .then((data)=>{
        return res.status(200).send(data);
    })
    .catch((err)=> endpointError(err,req,res));
});


/*
Upload summary of results
*/
router.post('/results/summary',
passport.authenticate('subagent-cookie', {session: false}),
(req,res,next)=>{
    debug('received request to /results/summary');
    
});
