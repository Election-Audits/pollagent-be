// routes for supervisor specific endpoints

const debug = require('debug')('ea:rte-supervisor');
debug.log = console.log.bind(console);
import * as express from "express";
import { endpointError } from "shared-lib/backend/misc";
import passport from "passport";
import { COOKIE_SECRET as cookieSecretEnv, BUILD } from "../utils/env";
import cookieParser from "cookie-parser";
import { secrets , checkSecretsReturned } from "../utils/infisical";
import { BUILD_TYPES } from "shared-lib/constants";
import { pollAgentSession } from "../utils/session";
import { postSubAgents } from "../controllers/supervisor";



const router = express.Router();

export default router;

router.use(express.json());

let cookieSecret = cookieSecretEnv +'';

router.use(cookieParser(cookieSecret));
router.use((req,res,next)=> pollAgentSession(req,res,next));


/*
Obtain secrets (cookie), set up cookie parser
*/
async function setup() {
    await checkSecretsReturned();
    // set cookie secret for cloud build. Will be used by cookieParser
    cookieSecret = (BUILD == BUILD_TYPES.local) ? cookieSecretEnv+'' : secrets.COOKIE_SECRET;
}

setup();



/*

*/
router.post('/subagents',
passport.authenticate('supervisor-cookie', {session: false}),
(req,res,next)=>{
    debug('received request to POST /subagents...');
    postSubAgents(req,res,next)
    .then(()=>{
        return res.status(200).end();
    })
    .catch((err)=> endpointError(err,req,res));
});



