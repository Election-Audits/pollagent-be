// Request input checking

const debug = require('debug')('ea:joi');
debug.log = console.log.bind(console);
import * as Joi from "joi";


// reused validation fields
const email = Joi.string().email().min(3).max(30);
const password = Joi.string().min(6).max(30);
const phone = Joi.number();
const code = Joi.string().alphanum().max(20);
const objectIdStr = Joi.string().alphanum().max(24);


// schema for signup endpoint
export const signupSchema = Joi.object({
    email,
    phone,
    password: password.required()
});
// TODO: apply .or for email, phone


// schema for signupConfirm endpoint
export const signupConfirmSchema = Joi.object({
    email,
    phone,
    code: code.required()
});


// schema for login endpoint
export const loginSchema = Joi.object({
    email,
    phone,
    password: password.required()
});


// schema for loginConfirm endpoint
export const loginConfirmSchema = Joi.object({
    email,
    phone,
    code: code.required()
});

// resend code schema
export const resendCodeSchema = Joi.object({
    email,
    phone
});

// schema for password reset
export const passwordResetSchema = Joi.object({
    email,
    phone,
});


// schema for password reset confirm
export const passwordResetConfirmSchema = Joi.object({
    email,
    phone,
    password: password.required(),
    code: code.required()
});


// update profile schema
export const updateProfileSchema = Joi.object({
    surname: Joi.string().max(50),
    otherNames: Joi.string().max(50)
});


// add subAgents
export const postSubAgentsSchema = Joi.object({
    people: Joi.array().items(
        Joi.object({
            email,
            phone,
            surname: Joi.string().max(50),
            otherNames: Joi.string().max(50)
        })
    )
});


// get a specific sub agent
export const getOneSubAgentSchema = Joi.object({
    id: Joi.string().alphanum().max(30)
});


// assign an electoral area to an agent
export const putAgentElectoralAreaSchema = Joi.object({
    electoralAreaId: Joi.string().max(30)
});


// upload pictures of polling station results
export const postResultPicturesSchema = Joi.object({
    electionId: Joi.string().alphanum().max(30),
});


// submit summary of results, in relation to uploaded pictures
export const postResultSummarySchema = Joi.object({
    resultId: objectIdStr,
    results: Joi.array().items(
        Joi.object({
            partyId: objectIdStr,
            candidateId: objectIdStr,
            numVotes: Joi.number(),
            name: Joi.string().max(50) // optional. for results of unknown candidate
        })
    ),
    summary: Joi.object({
        numRegisteredVoters: Joi.number(),
        totalNumVotes: Joi.number(),
        numRejectedVotes: Joi.number()
    })
});


// single input with id field
export const objectIdSchema = Joi.object({
    id: objectIdStr
});
