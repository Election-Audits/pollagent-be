// routes for endpoints for poll-agents (ie. supervisors and sub-agents)

const debug = require('debug')('ea:rte-pollagent');
debug.log = console.log.bind(console);
import * as express from "express";
import { endpointError } from "shared-lib/backend/misc";
import passport from "passport";
import { COOKIE_SECRET as cookieSecretEnv, BUILD } from "../utils/env";
import cookieParser from "cookie-parser";
import { secrets , checkSecretsReturned } from "../utils/infisical";
import { BUILD_TYPES } from "shared-lib/constants";
import { pollAgentSession } from "../utils/session";
import { getElectoralAreaChoices, assignAgentElectoralArea, getAgentElectoralAreas, getElectoralAreaParentElections } 
from "../controllers/poll-agent";


const router = express.Router();

export default router;

router.use(express.json());

let cookieSecret = cookieSecretEnv +'';

router.use(cookieParser(cookieSecret));
router.use((req,res,next)=> pollAgentSession(req,res,next));



/*
GET choices of electoral areas available to be chosen by a polling agent
*/
router.get('/electoral-area/options',
passport.authenticate('pollagent-cookie', {session: false}),
(req,res,next)=>{
    debug('received request to GET /electoral-area/choices...');
    getElectoralAreaChoices(req,res,next)
    .then((data)=>{
        return res.status(200).send(data);
    })
    .catch((err)=> endpointError(err,req,res));
});


/*
Add an electoral area (eg. polling station) to those handled by this polling agent 
*/
router.put('/agent/electoral-area',
passport.authenticate('pollagent-cookie', {session: false}),
(req,res,next)=>{
    debug('received request to PUT /agent/electoral-area...');
    assignAgentElectoralArea(req,res,next)
    .then(()=>{
        return res.status(200).end();
    })
    .catch((err)=> endpointError(err,req,res));
});


/*
GET all electoral areas assigned to user
*/
router.get('/agent/electoral-areas',
passport.authenticate('pollagent-cookie', {session: false}),
(req,res,next)=>{
    debug('received request to GET /agent/electoral-areas...');
    getAgentElectoralAreas(req,res,next)
    .then((data)=>{
        return res.status(200).send(data);
    })
    .catch((err)=> endpointError(err,req,res));
});


/*
GET the upcoming elections for a given electoralArea, and its parents
*/
router.get('/electoral-area/:id/parents/elections',
passport.authenticate('pollagent-cookie', {session: false}),
(req,res,next)=>{
    debug('received request to GET /electoral-area/:id/parents/elections...');
    getElectoralAreaParentElections(req,res,next)
    .then((data)=>{
        return res.status(200).send(data);
    })
    .catch((err)=> endpointError(err,req,res));
});
