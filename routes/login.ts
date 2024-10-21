const debug = require('debug')('ea:rte-login');
debug.log = console.log.bind(console);
import * as express from "express";
import { endpointError } from "shared-lib/backend/misc";
import { secrets , checkSecretsReturned } from "../utils/infisical";
import { BUILD_TYPES } from "shared-lib/constants";
import { BUILD, EMAIL_USER as emailUserEnv, EMAIL_PASSWORD as emailPasswordEnv, COOKIE_SECRET as cookieSecretEnv }
from "../utils/env";
import passport from "passport";
import i18next from "i18next";
import cookieParser from "cookie-parser";
import { pollAgentSession } from "../utils/session";
import { signup, signupConfirm, login, loginConfirm, passwordReset, passwordResetConfirm, resendCode, updateProfile } 
from "../controllers/login";



const router = express.Router();

export default router;


router.use(express.json()); // parse body

let cookieSecret = cookieSecretEnv +'';
router.use(cookieParser(cookieSecret));


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
Signup. For signup, there has to either be an existing email or phone record in the db to serve as preapproval
*/
router.post('/signup',
(req,res,next)=>{
    debug('received request to /signup...');
    signup(req,res,next)
    .then(()=>{
        res.status(200).end();
    })
    .catch((err)=> endpointError(err,req,res));
});


/*
Signup confirm
*/
router.put('/signup/confirm',
(req,res,next)=> pollAgentSession(req,res,next),
(req,res,next)=>{
    debug('received request to /signup/confirm');
    signupConfirm(req,res,next)
    .then((data)=>{
        // also send data to be used to prepopulate next screen for filling profile details
        res.status(200).send(data);
    })
    .catch((err)=> endpointError(err,req,res));
});


/*
Login
*/
router.put('/login',
(req,res,next)=>{
    debug('received request to /login...');
    login(req,res,next)
    .then(()=>{
        return res.status(200).end();
    })
    .catch((err)=> endpointError(err,req,res));
});


/*
Login confirm
*/
router.put('/login/confirm',
(req,res,next)=> pollAgentSession(req,res,next),
(req,res,next)=>{
    debug('received request to /login/confirm...');
    loginConfirm(req,res,next)
    .then((data)=>{
        return res.status(200).send(data);
    })
    .catch((err)=> endpointError(err,req,res));
});


/*
Resend code
*/
router.put('/code',
(req,res,next)=> pollAgentSession(req,res,next),
(req,res,next)=>{
    debug('received request to /code...');
    resendCode(req,res,next)
    .then(()=>{
        return res.status(200).end();
    })
    .catch((err)=> endpointError(err,req,res));
});


/*
Password reset. TODO: rate limit?
*/
router.put('/password/reset',
(req,res,next)=>{
    debug('received request to /password/reset...');
    passwordReset(req,res,next)
    .then(()=>{
        return res.status(200).end();
    })
    .catch((err)=> endpointError(err,req,res));
});


/*
Reset password confirm
*/
router.put('/password/reset/confirm',
(req,res,next)=>{
    debug('received request to /password/reset/confirm...');
    passwordResetConfirm(req,res,next)
    .then(()=>{
        return res.status(200).end();
    })
    .catch((err)=> endpointError(err,req,res));
});


/*
Update profile details
*/
router.put('/profile',
(req,res,next)=> pollAgentSession(req,res,next),
passport.authenticate('pollagent-cookie', {session: false}), // NB: needs authentication to update profile
(req,res,next)=>{
    debug('received request to PUT /profile...');
    updateProfile(req,res,next)
    .then((data)=>{
        return res.status(200).send(data);
    })
    .catch((err)=> endpointError(err,req,res));
});

