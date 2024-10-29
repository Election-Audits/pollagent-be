// Error created for http response
interface RequestError {
    errMsg: string | undefined // the error message
}


// Email Input
interface EmailInput {
    recipient: string,
    subject: string,
    text: string
}


// Add a declaration that will be merged with Express
declare namespace Express {
    interface Request { // add fields to Request
        myFileLastDir: string,
        myFileFullDir: string,
        myAllowedExts: string[]
        //myFileName: string
    }

    interface User { // add email to Request.User
        _id: string,
        email: string,
        phone: string,
        electoralLevel: string,
        supervisorId: string,
        partyId: string,
        candidateId: string
    }
}
