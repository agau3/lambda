import { APIGatewayProxyResult } from "aws-lambda";

export async function ok(payload?: any): Promise<APIGatewayProxyResult> {
    let body = payload ? payload : { message: 'submitted' }
    return response(200, body)
}

export function badRequest(message: string): APIGatewayProxyResult {
    return response(400, {message})
}

export function error(statusCode: number, message: any): APIGatewayProxyResult {
    return response(statusCode, {message})
}



export async function forbidden(message: string): Promise<APIGatewayProxyResult> {
    return response(403, {message})
}

function response(statusCode: number, payload: any, responseHeaders?: {[key: string]: string | number | boolean}): APIGatewayProxyResult {
    const headers: {[key: string]: string | number | boolean} = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Access-Control-Allow-Headers,Access-Control-Allow-Origin,Authorization,Content-Type,Text,X-Amz-Date,X-Amz-Security-Token,X-Amz-User-Agent,X-Api-Key,X-Auth-Id,X-Auth-Role,X-Customer-Id',
        'Access-Control-Allow-Credentials': true
      }
    if (responseHeaders) {
        for (const name in responseHeaders) {
            headers[name] = responseHeaders[name]
        }
    }
    return {
        statusCode,
        headers,
        body: typeof payload === 'string' ? payload : JSON.stringify(payload)
    }
}
